import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { boundedForm, privateHeaders } from "../services/http.server";
import { orderReviewLinks } from "../services/order-reviews.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 405, headers: privateHeaders }));
}
export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  if (sessionToken.aud !== process.env.SHOPIFY_API_KEY)
    return cors(new Response(null, { status: 401, headers: privateHeaders }));
  try {
    const form = await boundedForm(request);
    const orderId = z
      .string()
      .regex(/^gid:\/\/shopify\/Order\/\d+$/)
      .parse(form.get("orderId"))
      .split("/")
      .pop()!;
    const checkoutToken = z
      .string()
      .min(16)
      .max(512)
      .optional()
      .parse(form.get("checkoutToken") || undefined);
    const shop = z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/)
      .parse(sessionToken.dest.replace(/^https:\/\//, "").replace(/\/$/, ""));
    const customerId = /^gid:\/\/shopify\/Customer\/\d+$/.test(
      sessionToken.sub || "",
    )
      ? sessionToken.sub!.split("/").pop()
      : undefined;
    return cors(
      Response.json(
        await orderReviewLinks(shop, orderId, { checkoutToken, customerId }),
        { headers: privateHeaders },
      ),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return cors(
        Response.json(
          { error: "Invalid order request" },
          { status: 400, headers: privateHeaders },
        ),
      );
    if (error instanceof Response) return cors(error);
    throw error;
  }
}
