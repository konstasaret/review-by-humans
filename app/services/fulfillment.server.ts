import { z } from "zod";
import db from "../db.server";
import { encrypt, opaque } from "./crypto.server";
import { productEligible } from "./policy";
const id = z
  .union([z.string().regex(/^\d+$/), z.number().int().safe().positive()])
  .transform(String);
const orderPayload = z.object({
  id,
  created_at: z.string().datetime({ offset: true }),
  financial_status: z.string().optional(),
  checkout_token: z.string().min(16).max(512).nullable().optional(),
  email: z.string().email().nullable().optional(),
  customer: z.object({ id }).nullable().optional(),
  cancelled_at: z.string().nullable(),
  fulfillment_status: z.string().nullable(),
  fulfillments: z.array(
    z.object({
      status: z.string(),
      created_at: z.string().datetime({ offset: true }),
    }),
  ),
  line_items: z.array(
    z.object({
      product_id: id.nullable(),
      title: z.string(),
      quantity: z.number().int().nonnegative(),
      fulfillment_status: z.string().nullable(),
    }),
  ),
});
export const COLLECTIONS_QUERY = `#graphql
query ProductCollections($id: ID!, $after: String) {
  product(id: $id) { collections(first: 100, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }
}`;
export async function ingestOrder(
  shop: string,
  raw: unknown,
  collections: (productId: string) => Promise<string[]>,
) {
  const m = await db.merchant.findUnique({ where: { shop } });
  if (!m?.onboarded) return;
  const payload = orderPayload.parse(raw);
  if (
    payload.cancelled_at ||
    ["refunded", "partially_refunded", "voided"].includes(
      payload.financial_status || "",
    )
  ) {
    await revokeOrder(shop, payload.id);
    return;
  }
  // Legacy column name: this now records the order's eligibility start, not shipment.
  const fulfilledAt = new Date(payload.created_at);
  const dueAt = fulfilledAt;
  const expiresAt = new Date(dueAt.getTime() + 30 * 86400000);
  if (expiresAt < new Date()) return;
  // Resolve all external lookups before writing; retries are safe via unique order/product keys.
  const eligible: typeof payload.line_items = [];
  for (const line of payload.line_items) {
    if (!line.product_id || !line.quantity) continue;
    const memberships = m.eligibleCollections
      ? await collections(line.product_id)
      : [];
    if (
      productEligible(
        m.eligibleProducts,
        m.eligibleCollections,
        line.product_id,
        memberships,
      )
    )
      eligible.push(line);
  }
  await db.$transaction(async (tx) => {
    const order = await tx.order.upsert({
      where: {
        merchantId_shopifyId: { merchantId: m.id, shopifyId: payload.id },
      },
      create: {
        merchantId: m.id,
        shopifyId: payload.id,
        customerId: payload.customer?.id,
        emailCipher: payload.email ? encrypt(payload.email) : null,
        checkoutTokenHash: payload.checkout_token
          ? opaque(`checkout:${shop}`, payload.checkout_token)
          : null,
      },
      update: payload.checkout_token
        ? {
            checkoutTokenHash: opaque(
              `checkout:${shop}`,
              payload.checkout_token,
            ),
          }
        : {},
    });
    if (order.cancelled) return;
    for (const line of eligible) {
      const product = await tx.product.upsert({
        where: {
          merchantId_shopifyId: {
            merchantId: m.id,
            shopifyId: line.product_id!,
          },
        },
        create: {
          merchantId: m.id,
          shopifyId: line.product_id!,
          title: line.title,
        },
        update: { title: line.title },
      });
      await tx.invitation.upsert({
        where: {
          orderId_productId: { orderId: order.id, productId: product.id },
        },
        create: {
          merchantId: m.id,
          orderId: order.id,
          productId: product.id,
          fulfilledAt,
          dueAt,
          expiresAt,
        },
        update: {},
      });
    }
  });
}
export async function revokeOrder(shop: string, orderId: string) {
  // Persist a tombstone even if cancellation arrives before fulfillment.
  const m = await db.merchant.findUnique({ where: { shop } });
  if (!m) return;
  await db.$transaction(async (tx) => {
    const order = await tx.order.upsert({
      where: { merchantId_shopifyId: { merchantId: m.id, shopifyId: orderId } },
      create: { merchantId: m.id, shopifyId: orderId, cancelled: true },
      update: { cancelled: true, emailCipher: null },
    });
    await tx.invitation.updateMany({
      where: { orderId: order.id },
      data: { revoked: true, tokenHash: null, tokenCipher: null },
    });
    await tx.review.updateMany({
      where: { invitation: { orderId: order.id } },
      data: { status: "hidden" },
    });
  });
}
