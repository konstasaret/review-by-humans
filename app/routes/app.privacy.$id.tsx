import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { merchant } from "../services/merchant.server";
import { privateHeaders } from "../services/http.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { merchant: m } = await merchant(request);
  const ticket = await db.privacyRequest.findFirst({
    where: { id: params.id, merchantId: m.id },
  });
  if (!ticket) throw new Response("Not found", { status: 404 });
  const orders = ticket.customerId
    ? await db.order.findMany({
        where: { merchantId: m.id, customerId: ticket.customerId },
        select: {
          shopifyId: true,
          invitations: {
            select: {
              fulfilledAt: true,
              sentAt: true,
              review: {
                select: {
                  rating: true,
                  title: true,
                  body: true,
                  reply: true,
                  status: true,
                  worldVerified: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      })
    : [];
  return Response.json(
    { requestId: ticket.requestId, orders },
    {
      headers: {
        ...privateHeaders,
        "Content-Disposition":
          'attachment; filename="customer-review-data.json"',
      },
    },
  );
}
