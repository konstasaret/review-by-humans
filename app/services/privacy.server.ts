import db from "../db.server";
import { removeDevelopmentMessages } from "./email.server";
export async function removeShop(shop: string) {
  const invitations = await db.invitation.findMany({
    where: { merchant: { shop } },
    select: { id: true },
  });
  await removeDevelopmentMessages(invitations.map((i) => i.id));
  await db.$transaction([
    db.merchant.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}
export async function redactCustomer(
  shop: string,
  customerId: string | undefined,
  orderIds: string[],
) {
  const m = await db.merchant.findUnique({ where: { shop } });
  if (!m) return;
  const orders = await db.order.findMany({
    where: {
      merchantId: m.id,
      OR: [
        ...(customerId ? [{ customerId }] : []),
        { shopifyId: { in: orderIds } },
      ],
    },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  const invitations = await db.invitation.findMany({
    where: { orderId: { in: ids } },
    select: { id: true },
  });
  await removeDevelopmentMessages(invitations.map((i) => i.id));
  await db.$transaction(async (tx) => {
    // Customer erasure removes associated anti-duplication values too.
    await tx.verification.deleteMany({
      where: {
        merchantId: m.id,
        review: { invitation: { orderId: { in: ids } } },
      },
    });
    await tx.order.deleteMany({ where: { id: { in: ids }, merchantId: m.id } });
    if (customerId)
      await tx.privacyRequest.deleteMany({
        where: { merchantId: m.id, customerId },
      });
  });
}
