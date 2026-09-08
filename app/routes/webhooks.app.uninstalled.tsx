import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { removeShop } from "../services/privacy.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);
  await removeShop(shop);
  return new Response(null, { status: 200 });
}
