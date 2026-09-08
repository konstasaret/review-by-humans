import { Prisma } from "@prisma/client";
import db from "../db.server";
import { hash } from "./crypto.server";
import { assertEligible, reviewInput, publicationStatus } from "./policy";
import {
  actionScope,
  provider,
  type VerificationProvider,
} from "./world.server";
export class InvitationAlreadyUsedError extends Error {
  constructor() {
    super(
      "Your review has already been submitted. This link can only be used once.",
    );
  }
}
export async function invitation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid invitation");
  const i = await db.invitation.findUnique({
    where: { tokenHash: hash(token) },
    include: { merchant: true, product: true, order: true },
  });
  if (!i) throw new Error("Invitation not found");
  if (i.consumedAt && !i.revoked && !i.order.cancelled)
    throw new InvitationAlreadyUsedError();
  assertEligible(i);
  return i;
}
export async function submitReview(
  token: string,
  input: unknown,
  proof: unknown,
  verifier: VerificationProvider = provider(),
) {
  const i = await invitation(token),
    content = reviewInput.parse(input);
  let outcome = null;
  if (proof) {
    if (!i.nonce || !i.nonceExpiresAt || i.nonceExpiresAt <= new Date())
      throw new Error("Verification expired. Start again.");
    outcome = await verifier.verify(proof, {
      action: actionScope(i.merchant.shop, i.product.shopifyId),
      nonce: i.nonce,
    });
  }
  const status = publicationStatus(
    i.merchant.requireWorld,
    outcome?.verified ?? false,
    outcome?.mock ?? false,
    i.merchant.autoPublish,
  );
  try {
    return await db.$transaction(async (tx) => {
      // Atomic consumption also prevents two concurrent submissions of one invitation.
      const claimed = await tx.invitation.updateMany({
        where: {
          id: i.id,
          consumedAt: null,
          revoked: false,
          expiresAt: { gt: new Date() },
          order: { cancelled: false },
          ...(proof
            ? { nonce: i.nonce, nonceExpiresAt: { gt: new Date() } }
            : {}),
        },
        data: {
          consumedAt: new Date(),
          startedAt: i.startedAt || new Date(),
          nonce: null,
          nonceExpiresAt: null,
        },
      });
      if (claimed.count !== 1)
        throw new Error("Invitation already used or revoked");
      const r = await tx.review.create({
        data: {
          ...content,
          merchantId: i.merchantId,
          productId: i.productId,
          invitationId: i.id,
          status,
          worldVerified: outcome?.verified ?? false,
          mock: outcome?.mock ?? false,
        },
      });
      if (outcome)
        await tx.verification.create({
          data: {
            merchantId: i.merchantId,
            productId: i.productId,
            reviewId: r.id,
            digest: outcome.digest,
            provider: outcome.provider,
          },
        });
      return {
        status: r.status,
        mock: r.mock,
        sandbox: outcome?.provider.endsWith("-sandbox") ?? false,
      };
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      await db.merchant.update({
        where: { id: i.merchantId },
        data: { duplicateAttempts: { increment: 1 } },
      });
      throw new Error(
        "A review from this human already exists for this product in this store.",
      );
    }
    throw e;
  }
}
export async function moderate(
  merchantId: string,
  id: string,
  intent: string,
  reply?: string,
) {
  const review = await db.review.findFirst({
    where: { id, merchantId },
    include: { merchant: true, invitation: { include: { order: true } } },
  });
  if (!review) throw new Error("Review not found");
  if (intent === "delete") {
    await db.review.delete({ where: { id } });
    return;
  }
  if (
    intent === "publish" &&
    (review.mock ||
      review.invitation.revoked ||
      review.invitation.order.cancelled ||
      (review.merchant.requireWorld && !review.worldVerified))
  )
    throw new Error("This review is not eligible for publication");
  if (intent === "reply") {
    await db.review.update({
      where: { id },
      data: { reply: reply?.trim().slice(0, 2000) || null },
    });
    return;
  }
  if (!["publish", "hide"].includes(intent))
    throw new Error("Invalid moderation action");
  await db.review.update({
    where: { id },
    data: { status: intent === "publish" ? "published" : "hidden" },
  });
}
