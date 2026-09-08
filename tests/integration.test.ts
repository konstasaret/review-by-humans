import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import db from "../app/db.server";
import { hash, encrypt } from "../app/services/crypto.server";
import {
  invitation,
  submitReview,
  moderate,
} from "../app/services/reviews.server";
import {
  MockProvider,
  WorldProvider,
  actionScope,
} from "../app/services/world.server";
import {
  ingestFulfilled,
  revokeOrder,
} from "../app/services/fulfillment.server";
import { deliverDue, purgeExpired } from "../app/services/invitations.server";
import { redactCustomer, removeShop } from "../app/services/privacy.server";
import { DevelopmentEmailSender } from "../app/services/email.server";
import { secureSessionStorage } from "../app/services/session.server";
import { Session } from "@shopify/shopify-api";
import { authenticate } from "../app/shopify.server";
beforeEach(async () => {
  await db.merchant.deleteMany();
  await db.session.deleteMany();
});
after(async () => {
  await db.$disconnect();
});
const review = {
  rating: 2,
  title: "Room to improve",
  body: "This was useful but the finish could be better.",
};
async function fixture(shop = "alpha.myshopify.com", productId = "1") {
  const m = await db.merchant.upsert({
    where: { shop },
    create: { shop, onboarded: true, autoPublish: true },
    update: {},
  });
  const product = await db.product.upsert({
    where: { merchantId_shopifyId: { merchantId: m.id, shopifyId: productId } },
    create: { merchantId: m.id, shopifyId: productId, title: "Product" },
    update: {},
  });
  const order = await db.order.create({
    data: {
      merchantId: m.id,
      shopifyId: randomBytes(8).toString("hex"),
      customerId: "customer-1",
      emailCipher: encrypt("reviewer@example.com"),
    },
  });
  const token = randomBytes(32).toString("hex"),
    nonce = randomBytes(16).toString("hex");
  const i = await db.invitation.create({
    data: {
      merchantId: m.id,
      productId: product.id,
      orderId: order.id,
      fulfilledAt: new Date(Date.now() - 10000),
      dueAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 86400000),
      tokenHash: hash(token),
      tokenCipher: encrypt(token),
      nonce,
      nonceExpiresAt: new Date(Date.now() + 300000),
    },
  });
  return {
    m,
    product,
    order,
    i,
    token,
    proof: { mockHuman: "same-human", nonce },
  };
}
function realProof(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    protocol_version: "4.0",
    environment: "production",
    nonce: f.i.nonce,
    action: actionScope(f.m.shop, f.product.shopifyId),
    responses: [
      {
        identifier: "proof_of_human",
        issuer_schema_id: 1,
        nullifier: "0x1234",
        proof: ["test-only"],
      },
    ],
  };
}
const serverVerifier = new WorldProvider((async (_url, init) => {
  const proof = JSON.parse(String(init?.body));
  return Response.json({
    success: true,
    action: proof.action,
    environment: "production",
    results: [
      {
        identifier: "proof_of_human",
        success: true,
        nullifier: proof.responses[0].nullifier,
      },
    ],
  });
}) as typeof fetch);
test("mock review persists privately and cannot be published", async () => {
  const f = await fixture();
  const result = await submitReview(
    f.token,
    review,
    f.proof,
    new MockProvider(),
  );
  assert.deepEqual(result, { status: "pending", mock: true, sandbox: false });
  const r = await db.review.findUniqueOrThrow({
    where: { invitationId: f.i.id },
  });
  assert.equal(r.worldVerified, false);
  await assert.rejects(moderate(f.m.id, r.id, "publish"));
  await assert.rejects(invitation(f.token));
});
test("real adapter outcome publishes and duplicate human rolls back second invitation", async () => {
  const a = await fixture(),
    b = await fixture();
  assert.equal(
    (await submitReview(a.token, review, realProof(a), serverVerifier)).status,
    "published",
  );
  await assert.rejects(
    submitReview(b.token, review, realProof(b), serverVerifier),
    /already exists/,
  );
  assert.equal(await db.review.count(), 1);
  assert.equal(
    (await db.invitation.findUniqueOrThrow({ where: { id: b.i.id } }))
      .consumedAt,
    null,
  );
  assert.equal(
    (await db.merchant.findUniqueOrThrow({ where: { id: a.m.id } }))
      .duplicateAttempts,
    1,
  );
});
test("same human can review different products and stores", async () => {
  for (const [shop, product] of [
    ["alpha.myshopify.com", "1"],
    ["alpha.myshopify.com", "2"],
    ["beta.myshopify.com", "1"],
  ]) {
    const f = await fixture(shop, product);
    await submitReview(f.token, review, f.proof, new MockProvider());
  }
  assert.equal(await db.review.count(), 3);
  assert.equal(
    new Set((await db.verification.findMany()).map((v) => v.digest)).size,
    3,
  );
});
test("concurrent submission consumes invitation only once", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    submitReview(f.token, review, f.proof, new MockProvider()),
    submitReview(f.token, review, f.proof, new MockProvider()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.review.count(), 1);
});
test("failed proof and validation do not consume invitation", async () => {
  const f = await fixture();
  await assert.rejects(
    submitReview(
      f.token,
      review,
      { ...f.proof, nonce: "bad" },
      new MockProvider(),
    ),
  );
  await assert.rejects(
    submitReview(
      f.token,
      { ...review, rating: 9 },
      f.proof,
      new MockProvider(),
    ),
  );
  assert.equal((await invitation(f.token)).consumedAt, null);
  assert.equal(await db.review.count(), 0);
});
test("expired challenge cannot submit a proof; optional proof remains unbadged", async () => {
  const f = await fixture();
  await db.invitation.update({
    where: { id: f.i.id },
    data: { nonceExpiresAt: new Date(0) },
  });
  await assert.rejects(
    submitReview(f.token, review, f.proof, new MockProvider()),
    /expired/,
  );
  await assert.rejects(
    submitReview(f.token, review, null, new MockProvider()),
    /required/,
  );
  await db.merchant.update({
    where: { id: f.m.id },
    data: { requireWorld: false },
  });
  await submitReview(f.token, review, null, new MockProvider());
  assert.equal((await db.review.findFirstOrThrow()).worldVerified, false);
  assert.equal(await db.verification.count(), 0);
});
test("moderation is store-scoped; deletion preserves duplicate prevention", async () => {
  const a = await fixture();
  await submitReview(a.token, review, realProof(a), serverVerifier);
  const r = await db.review.findFirstOrThrow();
  await assert.rejects(moderate("other-store", r.id, "delete"));
  await moderate(a.m.id, r.id, "reply", "Thanks for your honest feedback");
  await moderate(a.m.id, r.id, "hide");
  assert.equal((await db.review.findFirstOrThrow()).status, "hidden");
  await moderate(a.m.id, r.id, "delete");
  assert.equal(await db.review.count(), 0);
  assert.equal(await db.verification.count(), 1);
  const b = await fixture();
  await assert.rejects(
    submitReview(b.token, review, realProof(b), serverVerifier),
    /already exists/,
  );
});
const fulfilled = {
  id: 100,
  email: "buyer@example.com",
  customer: { id: 55 },
  cancelled_at: null,
  fulfillment_status: "fulfilled",
  fulfillments: [
    {
      status: "success",
      created_at: new Date(Date.now() - 10000).toISOString(),
    },
  ],
  line_items: [
    {
      product_id: 1,
      title: "Product",
      quantity: 1,
      fulfillment_status: "fulfilled",
    },
  ],
};
test("fulfillment scheduling is idempotent and applies product eligibility", async () => {
  const m = await db.merchant.create({
    data: {
      shop: "shop.myshopify.com",
      onboarded: true,
      delayDays: 7,
      eligibleCollections: "9",
    },
  });
  await ingestFulfilled(m.shop, fulfilled, async () => ["9"]);
  await ingestFulfilled(m.shop, fulfilled, async () => ["9"]);
  assert.equal(await db.invitation.count(), 1);
  const i = await db.invitation.findFirstOrThrow();
  assert.equal(i.dueAt.getTime() - i.fulfilledAt.getTime(), 7 * 86400000);
  await ingestFulfilled(m.shop, { ...fulfilled, id: 101 }, async () => ["8"]);
  assert.equal(await db.invitation.count(), 1);
});
test("cancelled/unfulfilled orders do not create invitations and out-of-order cancellation wins", async () => {
  const m = await db.merchant.create({
    data: { shop: "shop.myshopify.com", onboarded: true },
  });
  await ingestFulfilled(
    m.shop,
    { ...fulfilled, fulfillment_status: "partial" },
    async () => [],
  );
  await ingestFulfilled(
    m.shop,
    { ...fulfilled, cancelled_at: new Date().toISOString() },
    async () => [],
  );
  assert.equal(await db.invitation.count(), 0);
  await revokeOrder(m.shop, String(fulfilled.id));
  await ingestFulfilled(m.shop, fulfilled, async () => []);
  assert.equal(await db.invitation.count(), 0);
});
test("email delivery retries reuse token and id and skip sent invitations", async () => {
  const f = await fixture();
  const ids: string[] = [],
    texts: string[] = [];
  let calls = 0;
  const sender = {
    async send(msg: { id: string; text: string }) {
      ids.push(msg.id);
      texts.push(msg.text);
      if (++calls === 1) throw new Error("Network");
    },
  };
  assert.deepEqual(await deliverDue(sender), { sent: 0, failed: 1 });
  assert.deepEqual(await deliverDue(sender), { sent: 1, failed: 0 });
  assert.deepEqual(await deliverDue(sender), { sent: 0, failed: 0 });
  assert.equal(ids[0], ids[1]);
  assert.equal(texts[0], texts[1]);
  assert.ok(texts[0].includes(f.token));
});
test("cancellation revokes invitation and hides published review", async () => {
  const f = await fixture();
  await submitReview(f.token, review, realProof(f), serverVerifier);
  await revokeOrder(f.m.shop, f.order.shopifyId);
  assert.equal((await db.review.findFirstOrThrow()).status, "hidden");
  await assert.rejects(
    moderate(f.m.id, (await db.review.findFirstOrThrow()).id, "publish"),
  );
  assert.equal((await db.invitation.findFirstOrThrow()).tokenHash, null);
});
test("customer/shop erasure cascades without affecting another store", async () => {
  const a = await fixture(),
    b = await fixture("beta.myshopify.com");
  await submitReview(a.token, review, a.proof, new MockProvider());
  await submitReview(b.token, review, b.proof, new MockProvider());
  await redactCustomer(a.m.shop, "customer-1", []);
  assert.equal(await db.review.count(), 1);
  assert.equal(await db.verification.count(), 1);
  await removeShop(b.m.shop);
  assert.equal(await db.review.count(), 0);
  assert.equal(await db.verification.count(), 0);
});
test("expired invitation secrets and unnecessary email are purged", async () => {
  await fixture();
  await purgeExpired(new Date(Date.now() + 2 * 86400000));
  const i = await db.invitation.findFirstOrThrow();
  assert.equal(i.tokenHash, null);
  assert.equal(i.tokenCipher, null);
  assert.equal((await db.order.findFirstOrThrow()).emailCipher, null);
});
test("OAuth session tokens round-trip encrypted at rest", async () => {
  const session = new Session({
    id: "offline_test",
    shop: "test.myshopify.com",
    state: "state",
    isOnline: false,
    accessToken: "oauth-secret",
    refreshToken: "refresh-secret",
  });
  await secureSessionStorage.storeSession(session);
  const stored = await db.session.findFirstOrThrow();
  assert.notEqual(stored.accessToken, "oauth-secret");
  assert.equal(
    (await secureSessionStorage.loadSession(session.id))?.accessToken,
    "oauth-secret",
  );
  assert.equal(
    (await secureSessionStorage.findSessionsByShop(session.shop))[0]
      .refreshToken,
    "refresh-secret",
  );
  assert.equal(session.accessToken, "oauth-secret");
});
test("Shopify SDK rejects forged webhook HMAC and accepts correctly signed uninstall", async () => {
  const body = JSON.stringify({ id: 123 }),
    base = {
      "content-type": "application/json",
      "x-shopify-topic": "app/uninstalled",
      "x-shopify-shop-domain": "test.myshopify.com",
      "x-shopify-api-version": "2026-07",
      "x-shopify-webhook-id": "test-hook",
    };
  const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(body)
    .digest("base64");
  await assert.rejects(
    authenticate.webhook(
      new Request("https://reviews.example.com/webhooks/app/uninstalled", {
        method: "POST",
        headers: { ...base, "x-shopify-hmac-sha256": "forged" },
        body,
      }),
    ),
    (e) => e instanceof Response && e.status === 401,
  );
  const result = await authenticate.webhook(
    new Request("https://reviews.example.com/webhooks/app/uninstalled", {
      method: "POST",
      headers: { ...base, "x-shopify-hmac-sha256": hmac },
      body,
    }),
  );
  assert.equal(result.shop, "test.myshopify.com");
});
test("development email sender fails closed in production", async () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(
      new DevelopmentEmailSender().send({
        id: "x",
        to: "x@example.com",
        subject: "x",
        text: "x",
      }),
    );
  } finally {
    process.env.NODE_ENV = old;
  }
});

test("a replaced challenge cannot be accepted after verifier returns", async () => {
  const f = await fixture();
  const delayed = {
    async verify(proof: unknown, context: { action: string; nonce: string }) {
      const outcome = await new MockProvider().verify(proof, context);
      await db.invitation.update({
        where: { id: f.i.id },
        data: { nonce: "replacement" },
      });
      return outcome;
    },
  };
  await assert.rejects(submitReview(f.token, review, f.proof, delayed));
  assert.equal(await db.review.count(), 0);
  assert.equal(
    (await db.invitation.findUniqueOrThrow({ where: { id: f.i.id } }))
      .consumedAt,
    null,
  );
});

test("Selfie Check publishes with its own provider and blocks a repeated selfie credential", async () => {
  const { hashSignal } = await import("@worldcoin/idkit-core/hashing");
  const selfieProof = (f: Awaited<ReturnType<typeof fixture>>) => ({
    protocol_version: "3.0",
    environment: "production",
    nonce: f.i.nonce,
    action: actionScope(f.m.shop, f.product.shopifyId),
    responses: [
      {
        identifier: "selfie",
        nullifier: "0x42",
        merkle_root: "0x01",
        proof: "0x02",
        signal_hash: hashSignal(f.i.nonce!),
      },
    ],
  });
  const verifier = new WorldProvider(
    (async (_url, init) => {
      const proof = JSON.parse(String(init?.body));
      return Response.json({
        success: true,
        action: proof.action,
        environment: "production",
        results: [{ identifier: "selfie", success: true, nullifier: "0x42" }],
      });
    }) as typeof fetch,
    "selfie",
  );
  const first = await fixture();
  assert.equal(
    (await submitReview(first.token, review, selfieProof(first), verifier))
      .status,
    "published",
  );
  assert.equal(
    (await db.verification.findFirstOrThrow()).provider,
    "world-selfie",
  );
  const second = await fixture();
  await assert.rejects(
    submitReview(second.token, review, selfieProof(second), verifier),
  );
  assert.equal(await db.review.count(), 1);
});

test("sandbox selfie completion stays private even with auto-publish enabled", async () => {
  const { hashSignal } = await import("@worldcoin/idkit-core/hashing");
  const old = process.env.WORLD_ENVIRONMENT;
  try {
    process.env.WORLD_ENVIRONMENT = "sandbox";
    const f = await fixture();
    const proof = {
      protocol_version: "3.0",
      environment: "sandbox",
      nonce: f.i.nonce,
      action: actionScope(f.m.shop, f.product.shopifyId),
      responses: [
        {
          identifier: "selfie",
          nullifier: "0x42",
          merkle_root: "0x01",
          proof: "0x02",
          signal_hash: hashSignal(f.i.nonce!),
        },
      ],
    };
    const verifier = new WorldProvider(
      (async () =>
        Response.json({
          success: true,
          environment: "sandbox",
          action: proof.action,
          results: [{ identifier: "selfie", success: true, nullifier: "0x42" }],
        })) as typeof fetch,
      "selfie",
    );
    const result = await submitReview(f.token, review, proof, verifier);
    assert.deepEqual(result, { status: "pending", mock: true, sandbox: true });
    const saved = await db.review.findFirstOrThrow();
    assert.equal(saved.worldVerified, false);
    assert.equal(
      (await db.verification.findFirstOrThrow()).provider,
      "world-selfie-sandbox",
    );
    await assert.rejects(moderate(f.m.id, saved.id, "publish"));
  } finally {
    process.env.WORLD_ENVIRONMENT = old;
  }
});
