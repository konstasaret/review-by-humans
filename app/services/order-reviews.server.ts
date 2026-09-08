import { randomBytes, timingSafeEqual } from "node:crypto";
import db from "../db.server";
import { decrypt, encrypt, hash, opaque } from "./crypto.server";

// The caller must first verify Shopify's extension session token. An order ID
// alone never grants access: require the checkout secret or signed customer ID.
export async function orderReviewLinks(
  shop: string,
  orderId: string,
  access: { checkoutToken?: string; customerId?: string },
  now = new Date(),
) {
  const order = await db.order.findFirst({
    where: { shopifyId: orderId, merchant: { shop, onboarded: true } },
  });
  if (!order) return { status: "waiting" as const, reviews: [] };
  const supplied = access.checkoutToken
    ? opaque(`checkout:${shop}`, access.checkoutToken)
    : undefined;
  const checkoutMatches = !!(
    supplied &&
    order.checkoutTokenHash &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(order.checkoutTokenHash))
  );
  const customerMatches = !!(
    order.customerId && access.customerId === order.customerId
  );
  if (!checkoutMatches && !customerMatches)
    return { status: "unavailable" as const, reviews: [] };
  if (order.cancelled) return { status: "unavailable" as const, reviews: [] };
  return db.$transaction(async (tx) => {
    const invitations = await tx.invitation.findMany({
      where: {
        orderId: order.id,
        revoked: false,
        consumedAt: null,
        dueAt: { lte: now },
        expiresAt: { gt: now },
        order: { cancelled: false },
      },
      include: { product: true },
    });
    const reviews = [];
    for (const invitation of invitations) {
      if (!invitation.tokenCipher) {
        const token = randomBytes(32).toString("hex");
        await tx.invitation.updateMany({
          where: { id: invitation.id, tokenHash: null },
          data: { tokenHash: hash(token), tokenCipher: encrypt(token) },
        });
      }
      const fresh = await tx.invitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      if (fresh.tokenCipher)
        reviews.push({
          title: invitation.product.title,
          path: `/review/${decrypt(fresh.tokenCipher)}`,
        });
    }
    return {
      status: reviews.length ? ("ready" as const) : ("waiting" as const),
      reviews,
    };
  });
}
