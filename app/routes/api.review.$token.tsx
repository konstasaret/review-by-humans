import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { invitation, submitReview } from "../services/reviews.server";
import { challenge, actionScope } from "../services/world.server";
import {
  boundedForm,
  sameOrigin,
  privateHeaders,
} from "../services/http.server";
export async function action({ request, params }: ActionFunctionArgs) {
  sameOrigin(request);
  const f = await boundedForm(request);
  try {
    if (f.get("intent") === "start") {
      const i = await invitation(params.token || "");
      await db.invitation.updateMany({
        where: { id: i.id, startedAt: null },
        data: { startedAt: new Date() },
      });
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    if (f.get("intent") === "challenge") {
      const i = await invitation(params.token || ""),
        action = actionScope(i.merchant.shop, i.product.shopifyId),
        c = challenge(action);
      await db.invitation.update({
        where: { id: i.id },
        data: { nonce: c.nonce, nonceExpiresAt: new Date(c.expires_at * 1000) },
      });
      return Response.json({ ...c, action }, { headers: privateHeaders });
    }
    const proof = f.get("proof") ? JSON.parse(String(f.get("proof"))) : null;
    return Response.json(
      await submitReview(
        params.token || "",
        { rating: f.get("rating"), title: f.get("title"), body: f.get("body") },
        proof,
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unable to submit review" },
      { status: 400, headers: privateHeaders },
    );
  }
}
