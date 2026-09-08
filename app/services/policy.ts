import { z } from "zod";
export const reviewInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5000),
});
export const settingsInput = z.object({
  delayDays: z.coerce.number().int().min(0).max(0),
  eligibleProducts: z
    .string()
    .max(10000)
    .regex(/^(\d+(,\d+)*)?$/),
  eligibleCollections: z
    .string()
    .max(10000)
    .regex(/^(\d+(,\d+)*)?$/),
  requireWorld: z.boolean(),
  autoPublish: z.boolean(),
  widgetEnabled: z.boolean(),
});
export function productEligible(
  products: string,
  collections: string,
  productId: string,
  memberships: string[],
) {
  if (!products && !collections) return true;
  return (
    products.split(",").includes(productId) ||
    memberships.some((id) => collections.split(",").includes(id))
  );
}
export function assertEligible(
  i: {
    fulfilledAt: Date;
    dueAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
    revoked: boolean;
    order: { cancelled: boolean };
  },
  now = new Date(),
) {
  if (
    i.revoked ||
    i.order.cancelled ||
    i.consumedAt ||
    i.fulfilledAt > now ||
    i.dueAt > now ||
    i.expiresAt <= now
  )
    throw new Error("This invitation is unavailable or has already been used.");
}
export function publicationStatus(
  requireWorld: boolean,
  verified: boolean,
  mock: boolean,
  autoPublish: boolean,
) {
  if (requireWorld && !verified && !mock)
    throw new Error("World verification is required.");
  return mock ? "pending" : autoPublish ? "published" : "pending";
}
