import "dotenv/config";
import db from "../app/db.server";
import { actionScope } from "../app/services/world.server";
try {
  const products = await db.product.findMany({
    include: { merchant: { select: { shop: true } } },
  });
  for (const p of products)
    console.log(
      JSON.stringify({
        store: p.merchant.shop,
        product: p.shopifyId,
        action: actionScope(p.merchant.shop, p.shopifyId),
      }),
    );
} finally {
  await db.$disconnect();
}
