import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return new Response("Store unavailable", { status: 404 });
  const url = new URL(request.url),
    product = url.searchParams.get("product");
  if (!product || !/^\d+$/.test(product))
    return new Response("Invalid product", { status: 400 });
  const m = await db.merchant.findUnique({ where: { shop: session.shop } });
  if (!m?.widgetEnabled)
    return Response.json(
      { reviews: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  const reviews = await db.review.findMany({
    where: {
      merchantId: m.id,
      product: { shopifyId: product },
      status: "published",
      mock: false,
      invitation: { revoked: false, order: { cancelled: false } },
      ...(m.requireWorld ? { worldVerified: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      rating: true,
      title: true,
      body: true,
      purchaser: true,
      worldVerified: true,
      reply: true,
      createdAt: true,
    },
  });
  return Response.json(
    { reviews },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
