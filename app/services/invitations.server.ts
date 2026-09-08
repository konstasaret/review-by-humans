import { randomBytes } from "node:crypto";
import db from "../db.server";
import { decrypt, encrypt, hash } from "./crypto.server";
import {
  createEmailSender,
  removeDevelopmentMessages,
  type EmailSender,
} from "./email.server";
export async function deliverDue(
  sender: EmailSender = createEmailSender(),
  now = new Date(),
) {
  const rows = await db.invitation.findMany({
    where: {
      dueAt: { lte: now },
      expiresAt: { gt: now },
      sentAt: null,
      revoked: false,
      consumedAt: null,
      order: { cancelled: false },
    },
    include: { order: true, product: true, merchant: true },
    take: 100,
  });
  let sent = 0,
    failed = 0;
  for (const i of rows) {
    if (!i.order.emailCipher) continue;
    try {
      // Stable token and delivery ID survive crashes; the sender must deduplicate by id.
      if (!i.tokenCipher) {
        const token = randomBytes(32).toString("hex");
        await db.invitation.updateMany({
          where: { id: i.id, tokenHash: null },
          data: { tokenHash: hash(token), tokenCipher: encrypt(token) },
        });
      }
      const fresh = await db.invitation.findUniqueOrThrow({
        where: { id: i.id },
        include: { order: true },
      });
      if (fresh.revoked || fresh.order.cancelled || !fresh.order.emailCipher)
        continue;
      const base = process.env.SHOPIFY_APP_URL;
      if (!base) throw new Error("SHOPIFY_APP_URL is required");
      const link = `${base.replace(/\/$/, "")}/review/${decrypt(fresh.tokenCipher!)}`;
      await sender.send({
        id: i.id,
        to: decrypt(fresh.order.emailCipher),
        subject: `How was ${i.product.title}?`,
        text: `Share an honest review of ${i.product.title} from ${i.merchant.shop}. All ratings are welcome. ${link}\nThe store does not receive your World ID, biometrics, or real-world identity through verification. Verification does not mean a review is factually true. Ignore this invitation if you do not wish to review; there are no reminders.`,
      });
      await db.invitation.update({
        where: { id: i.id },
        data: { sentAt: now },
      });
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
export async function purgeExpired(now = new Date()) {
  const expired = await db.invitation.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
  });
  await removeDevelopmentMessages(expired.map((i) => i.id));
  await db.invitation.updateMany({
    where: { expiresAt: { lte: now } },
    data: {
      tokenHash: null,
      tokenCipher: null,
      nonce: null,
      nonceExpiresAt: null,
    },
  });
  await db.order.updateMany({
    where: {
      invitations: {
        none: { expiresAt: { gt: now }, consumedAt: null, revoked: false },
      },
    },
    data: { emailCipher: null },
  });
}
