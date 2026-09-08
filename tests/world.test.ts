import test from "node:test";
import assert from "node:assert/strict";
import {
  WorldProvider,
  MockProvider,
  actionScope,
  verificationMode,
} from "../app/services/world.server";
import { encrypt, decrypt, opaque } from "../app/services/crypto.server";
const context = {
  action: actionScope("store-a.myshopify.com", "123"),
  nonce: "fresh-nonce",
};
const proof = {
  protocol_version: "4.0",
  environment: "production",
  action: context.action,
  nonce: context.nonce,
  responses: [
    {
      identifier: "proof_of_human",
      issuer_schema_id: 1,
      nullifier: "0xAb",
      proof: ["opaque-proof"],
    },
  ],
};
function transport(result: unknown, status = 200) {
  return (async () => Response.json(result, { status })) as typeof fetch;
}
const success = {
  success: true,
  environment: "production",
  action: context.action,
  results: [{ identifier: "proof_of_human", success: true, nullifier: "0xab" }],
};
test("World verifier calls server endpoint with untouched proof and canonicalizes nullifier", async () => {
  let body = "";
  const real = new WorldProvider((async (url, init) => {
    assert.match(
      String(url),
      /^https:\/\/developer.world.org\/api\/v4\/verify\//,
    );
    body = String(init?.body);
    return Response.json(success);
  }) as typeof fetch);
  const result = await real.verify(proof, context);
  assert.equal(body, JSON.stringify(proof));
  assert.equal(result.verified, true);
  assert.equal(result.mock, false);
  assert.equal(result.digest, opaque(context.action, "171"));
  assert.equal(
    (
      await real.verify(
        {
          ...proof,
          responses: [{ ...proof.responses[0], nullifier: "0x00ab" }],
        },
        context,
      )
    ).digest,
    result.digest,
  );
});
test("World rejects failed/partial responses and wrong environment, action, nullifier", async () => {
  for (const result of [
    { ...success, success: false },
    { ...success, results: [] },
    { ...success, environment: "staging" },
    { ...success, action: "another" },
    {
      ...success,
      results: [
        { identifier: "proof_of_human", success: false, nullifier: "0xab" },
      ],
    },
    {
      ...success,
      results: [
        { identifier: "proof_of_human", success: true, nullifier: "0xac" },
      ],
    },
  ])
    await assert.rejects(
      new WorldProvider(transport(result)).verify(proof, context),
    );
  await assert.rejects(
    new WorldProvider(transport({}, 400)).verify(proof, context),
  );
});
test("wrong nonce/action and legacy/session proofs never reach verifier", async () => {
  let calls = 0;
  const verifier = new WorldProvider((async () => {
    calls++;
    return Response.json(success);
  }) as typeof fetch);
  for (const change of [
    { nonce: "old" },
    { action: "other" },
    { environment: "staging" },
    { protocol_version: "3.0" },
    { responses: [{ identifier: "device", nullifier: "0xab" }] },
    {
      responses: [
        { identifier: "proof_of_human", session_nullifier: ["0xab"] },
      ],
    },
  ])
    await assert.rejects(verifier.verify({ ...proof, ...change }, context));
  assert.equal(calls, 0);
});
test("scope separates products and merchants without reusable human identifiers", async () => {
  const mock = new MockProvider(),
    p = { mockHuman: "same human", nonce: context.nonce };
  const a = await mock.verify(p, context);
  for (const action of [
    actionScope("store-a.myshopify.com", "124"),
    actionScope("store-b.myshopify.com", "123"),
  ])
    assert.notEqual(
      (await mock.verify(p, { ...context, action })).digest,
      a.digest,
    );
  assert.equal(a.verified, false);
  assert.equal(a.mock, true);
  await assert.rejects(mock.verify({ ...p, nonce: "wrong" }, context));
});
test("mock is impossible in production", async () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => verificationMode());
    await assert.rejects(
      new MockProvider().verify(
        { mockHuman: "human", nonce: context.nonce },
        context,
      ),
    );
  } finally {
    process.env.NODE_ENV = old;
  }
});
test("encrypted data uses randomized authenticated encryption", () => {
  const a = encrypt("secret"),
    b = encrypt("secret");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "secret");
  assert.ok(!a.includes("secret"));
  const pieces = a.split(".");
  pieces[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decrypt(pieces.join(".")));
});

test("Selfie Check verifies the exact v3 credential and preserves its assurance", async () => {
  const { hashSignal } = await import("@worldcoin/idkit-core/hashing");
  const selfie = {
    ...proof,
    protocol_version: "3.0",
    responses: [
      {
        identifier: "selfie",
        nullifier: "0xab",
        merkle_root: "0x01",
        proof: "0x02",
        signal_hash: hashSignal(context.nonce),
      },
    ],
  };
  let received = "";
  const result = await new WorldProvider(
    (async (_url, init) => {
      received = String(init?.body);
      return Response.json({
        ...success,
        results: [{ identifier: "selfie", success: true, nullifier: "0xab" }],
      });
    }) as typeof fetch,
    "selfie",
  ).verify(selfie, context);
  assert.equal(received, JSON.stringify(selfie));
  assert.equal(result.verified, true);
  assert.equal(result.provider, "world-selfie");
  assert.equal(result.mock, false);
});

test("Selfie Check rejects Orb, device, v4, wrong signal and unconfirmed results", async () => {
  const { hashSignal } = await import("@worldcoin/idkit-core/hashing");
  const selfie = {
    ...proof,
    protocol_version: "3.0",
    responses: [
      {
        identifier: "selfie",
        nullifier: "0xab",
        merkle_root: "0x01",
        proof: "0x02",
        signal_hash: hashSignal(context.nonce),
      },
    ],
  };
  let calls = 0;
  const verifier = new WorldProvider(
    (async () => {
      calls++;
      return Response.json(success);
    }) as typeof fetch,
    "selfie",
  );
  for (const invalid of [
    proof,
    { ...selfie, protocol_version: "4.0" },
    { ...selfie, nonce: "wrong" },
    { ...selfie, action: "other" },
    { ...selfie, environment: "staging" },
    ...["orb", "device", "face"].map((identifier) => ({
      ...selfie,
      responses: [{ ...selfie.responses[0], identifier }],
    })),
    {
      ...selfie,
      responses: [{ ...selfie.responses[0], signal_hash: hashSignal("other") }],
    },
  ])
    await assert.rejects(verifier.verify(invalid, context));
  assert.equal(calls, 0);
  // A successful result for a different credential must never bless a selfie proof.
  await assert.rejects(verifier.verify(selfie, context));
});

test("sandbox proof is isolated and cannot pass production environment checks", async () => {
  const old = process.env.WORLD_ENVIRONMENT;
  const sandboxProof = { ...proof, environment: "sandbox" };
  const sandboxSuccess = { ...success, environment: "sandbox" };
  try {
    process.env.WORLD_ENVIRONMENT = "sandbox";
    const result = await new WorldProvider(transport(sandboxSuccess)).verify(
      sandboxProof,
      context,
    );
    assert.equal(result.verified, false);
    assert.equal(result.mock, true);
    assert.equal(result.provider, "world-sandbox");
    assert.notEqual(result.digest, opaque(context.action, "171"));
    await assert.rejects(
      new WorldProvider(transport(success)).verify(sandboxProof, context),
    );
    await assert.rejects(
      new WorldProvider(transport(success)).verify(proof, context),
    );
    process.env.WORLD_ENVIRONMENT = "production";
    await assert.rejects(
      new WorldProvider(transport(sandboxSuccess)).verify(
        sandboxProof,
        context,
      ),
    );
  } finally {
    process.env.WORLD_ENVIRONMENT = old;
  }
});

test("sandbox configuration fails closed in a production deployment", async () => {
  const { verificationEnvironment } =
    await import("../app/services/world.server");
  const oldEnv = process.env.WORLD_ENVIRONMENT,
    oldNode = process.env.NODE_ENV;
  try {
    process.env.WORLD_ENVIRONMENT = "sandbox";
    process.env.NODE_ENV = "production";
    assert.throws(() => verificationEnvironment());
    process.env.NODE_ENV = "test";
    process.env.WORLD_ENVIRONMENT = "staging";
    assert.throws(() => verificationEnvironment());
  } finally {
    process.env.WORLD_ENVIRONMENT = oldEnv;
    process.env.NODE_ENV = oldNode;
  }
});
