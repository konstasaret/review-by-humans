import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { removeShop, redactCustomer } from "../services/privacy.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") await removeShop(shop);
  else if (topic === "CUSTOMERS_REDACT")
    await redactCustomer(
      shop,
      payload.customer?.id ? String(payload.customer.id) : undefined,
      (payload.orders_to_redact || []).map(String),
    );
  else if (topic === "CUSTOMERS_DATA_REQUEST") {
    const m = await db.merchant.findUnique({ where: { shop } });
    if (m)
      await db.privacyRequest.upsert({
        where: { requestId: String(payload.data_request.id) },
        create: {
          requestId: String(payload.data_request.id),
          merchantId: m.id,
          customerId: payload.customer?.id ? String(payload.customer.id) : null,
        },
        update: {},
      });
  } else return new Response("Unsupported topic", { status: 400 });
  return new Response(null, { status: 200 });
}
