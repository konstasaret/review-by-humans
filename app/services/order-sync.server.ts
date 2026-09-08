import db from "../db.server";
import { COLLECTIONS_QUERY, ingestOrder } from "./fulfillment.server";

export const ORDER_REVIEW_QUERY = `#graphql
query ReviewOrder($id: ID!, $after: String) {
  order(id: $id) {
    id createdAt cancelledAt displayFinancialStatus checkoutToken
    lineItems(first: 100, after: $after) {
      nodes { quantity title product { id } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
type Graphql = (
  query: string,
  options: { variables: Record<string, unknown> },
) => Promise<Response>;
type ShopifyOrder = {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  checkoutToken: string | null;
  lineItems: {
    nodes: {
      quantity: number;
      title: string;
      product: { id: string } | null;
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

// Called only after authenticating the extension. Persisted checkout access is
// sourced from Shopify, never from the buyer's submitted checkout token.
export async function syncMissingOrder(
  shop: string,
  orderId: string,
  graphql: Graphql,
) {
  if (
    await db.order.findFirst({
      where: { shopifyId: orderId, merchant: { shop } },
    })
  )
    return;
  const lines: ShopifyOrder["lineItems"]["nodes"] = [];
  let after: string | null = null;
  let order: ShopifyOrder;
  do {
    const response = await graphql(ORDER_REVIEW_QUERY, {
      variables: { id: `gid://shopify/Order/${orderId}`, after },
    });
    const result = await response.json();
    if (result.errors || !response.ok) throw new Error("Order sync failed");
    if (!result.data?.order) return;
    order = result.data.order;
    lines.push(...order.lineItems.nodes);
    after = order.lineItems.pageInfo.hasNextPage
      ? order.lineItems.pageInfo.endCursor
      : null;
  } while (after);
  await ingestOrder(
    shop,
    {
      id: orderId,
      created_at: order.createdAt,
      cancelled_at: order.cancelledAt,
      financial_status: order.displayFinancialStatus.toLowerCase(),
      checkout_token: order.checkoutToken,
      customer: null,
      fulfillment_status: null,
      fulfillments: [],
      line_items: lines.map((line) => ({
        product_id: line.product?.id.split("/").pop() || null,
        title: line.title,
        quantity: line.quantity,
        fulfillment_status: null,
      })),
    },
    async (productId) => {
      const ids: string[] = [];
      let after: string | null = null;
      do {
        const response = await graphql(COLLECTIONS_QUERY, {
          variables: { id: `gid://shopify/Product/${productId}`, after },
        });
        const result = await response.json();
        if (result.errors || !result.data?.product || !response.ok)
          throw new Error("Product sync failed");
        const collections = result.data.product.collections;
        ids.push(
          ...collections.nodes.map((n: { id: string }) =>
            n.id.split("/").pop()!,
          ),
        );
        after = collections.pageInfo.hasNextPage
          ? collections.pageInfo.endCursor
          : null;
      } while (after);
      return ids;
    },
  );
}
