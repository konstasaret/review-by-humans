import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  COLLECTIONS_QUERY,
  ingestFulfilled,
  revokeOrder,
} from "../services/fulfillment.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  if (topic === "ORDERS_FULFILLED") {
    await ingestFulfilled(shop, payload, async (id) => {
      if (!admin) throw new Error("Admin session unavailable");
      const ids: string[] = [];
      let after: string | null = null;
      do {
        const response = await admin.graphql(COLLECTIONS_QUERY, {
          variables: { id: `gid://shopify/Product/${id}`, after },
        });
        const result: {
          errors?: unknown;
          data?: {
            product: {
              collections: {
                nodes: { id: string }[];
                pageInfo: { hasNextPage: boolean; endCursor: string | null };
              };
            };
          };
        } = await response.json();
        if (result.errors || !result.data?.product)
          throw new Error("Collection lookup failed");
        const c = result.data.product.collections;
        ids.push(...c.nodes.map((n: { id: string }) => n.id.split("/").pop()!));
        after = c.pageInfo.hasNextPage ? c.pageInfo.endCursor : null;
      } while (after);
      return ids;
    });
  } else if (topic === "ORDERS_CANCELLED")
    await revokeOrder(shop, String(payload.id));
  else if (topic === "REFUNDS_CREATE")
    await revokeOrder(shop, String(payload.order_id));
  else return new Response("Unsupported topic", { status: 400 });
  return new Response(null, { status: 200 });
}
