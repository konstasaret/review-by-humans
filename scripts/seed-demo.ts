import "dotenv/config";
import { randomBytes } from "node:crypto";
import db from "../app/db.server";
import { encrypt, hash } from "../app/services/crypto.server";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo seed forbidden in production");
try {
  const merchant = await db.merchant.upsert({
    where: { shop: "development-demo.myshopify.com" },
    create: {
      shop: "development-demo.myshopify.com",
      onboarded: true,
      delayDays: 0,
    },
    update: {},
  });
  const product = await db.product.upsert({
    where: {
      merchantId_shopifyId: { merchantId: merchant.id, shopifyId: "1001" },
    },
    create: {
      merchantId: merchant.id,
      shopifyId: "1001",
      title: "Everyday Ceramic Cup",
    },
    update: {},
  });
  const order = await db.order.create({
    data: {
      merchantId: merchant.id,
      shopifyId: `demo-${Date.now()}`,
      emailCipher: encrypt("demo@example.invalid"),
    },
  });
  const token = randomBytes(32).toString("hex");
  await db.invitation.create({
    data: {
      merchantId: merchant.id,
      productId: product.id,
      orderId: order.id,
      fulfilledAt: new Date(Date.now() - 1000),
      dueAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      tokenHash: hash(token),
      tokenCipher: encrypt(token),
    },
  });
  console.log(
    `DEVELOPMENT FIXTURE — not a real Shopify order: ${process.env.SHOPIFY_APP_URL}/review/${token}`,
  );
} finally {
  await db.$disconnect();
}
