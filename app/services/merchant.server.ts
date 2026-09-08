import db from "../db.server";
import { authenticate } from "../shopify.server";
export async function merchant(request: Request) {
  const auth = await authenticate.admin(request);
  const record = await db.merchant.upsert({
    where: { shop: auth.session.shop },
    create: { shop: auth.session.shop },
    update: {},
  });
  return { ...auth, merchant: record };
}
