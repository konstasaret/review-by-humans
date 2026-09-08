import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, Link } from "react-router";
import db from "../db.server";
import { merchant } from "../services/merchant.server";
import { moderate } from "../services/reviews.server";
import { boundedForm } from "../services/http.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { merchant: m } = await merchant(request);
  const where = { merchantId: m.id };
  const [sent, started, published, verified, queue, reviews, privacy] =
    await Promise.all([
      db.invitation.count({ where: { ...where, sentAt: { not: null } } }),
      db.invitation.count({ where: { ...where, startedAt: { not: null } } }),
      db.review.count({ where: { ...where, status: "published" } }),
      db.review.count({ where: { ...where, worldVerified: true } }),
      db.review.count({ where: { ...where, status: "pending" } }),
      db.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          status: true,
          worldVerified: true,
          verification: { select: { provider: true } },
          mock: true,
          reply: true,
          product: { select: { title: true } },
        },
      }),
      db.privacyRequest.findMany({
        where,
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  return {
    onboarded: m.onboarded,
    sent,
    started,
    published,
    verified,
    queue,
    reviews,
    privacy,
    duplicates: m.duplicateAttempts,
    mode: process.env.WORLD_PROVIDER || "mock",
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const { merchant: m } = await merchant(request);
  const form = await boundedForm(request);
  try {
    await moderate(
      m.id,
      String(form.get("id")),
      String(form.get("intent")),
      String(form.get("reply") || ""),
    );
    return { ok: true, error: null };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unable to update review",
    };
  }
}
export default function Dashboard() {
  const d = useLoaderData<typeof loader>(),
    f = useFetcher<typeof action>();
  return (
    <s-page heading="World Verified Reviews">
      <s-button slot="primary-action" href="/app/settings">
        Review settings
      </s-button>
      {!d.onboarded && (
        <s-banner heading="Start collecting honest reviews" tone="info">
          Set your invitation timing and moderation preferences, then add the
          review block to your product template.{" "}
          <Link to="/app/settings">Set up your store</Link>
        </s-banner>
      )}
      {d.mode === "mock" && (
        <s-banner heading="Development verification is active" tone="warning">
          Mock proofs are for testing only. Mock reviews cannot be published or
          receive a verified human badge.
        </s-banner>
      )}
      {f.data?.error && <s-banner tone="critical">{f.data.error}</s-banner>}
      <s-section heading="Your review funnel">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))"
          gap="base"
        >
          {[
            ["Invitations sent", d.sent],
            ["Reviews started", d.started],
            ["Reviews published", d.published],
            [
              "World completion",
              `${d.started ? Math.round((d.verified / d.started) * 100) : 0}%`,
            ],
            ["Duplicate attempts prevented", d.duplicates],
          ].map(([label, value]) => (
            <s-box
              key={label}
              padding="base"
              background="subdued"
              borderRadius="base"
            >
              <s-stack gap="small">
                <s-text color="subdued">{label}</s-text>
                <s-heading>{value}</s-heading>
              </s-stack>
            </s-box>
          ))}
        </s-grid>
        <s-paragraph color="subdued">
          World completion = successful real World verifications ÷ reviews
          started. Counts reflect retained records; deletion changes totals.
        </s-paragraph>
      </s-section>
      <s-section heading={`Reviews · ${d.queue} awaiting moderation`}>
        {!d.reviews.length ? (
          <s-paragraph>
            Your first review will appear here after a fulfilled-order
            invitation is completed.
          </s-paragraph>
        ) : (
          <s-stack gap="base">
            {d.reviews.map((r) => (
              <s-box
                key={r.id}
                borderWidth="base"
                borderRadius="base"
                padding="base"
              >
                <s-stack gap="small">
                  <s-text color="subdued">
                    {r.product.title} · {r.rating}/5 stars
                  </s-text>
                  <s-heading>{r.title}</s-heading>
                  <s-paragraph>{r.body}</s-paragraph>
                  <s-stack direction="inline" gap="small">
                    <s-badge>{r.status}</s-badge>
                    {r.worldVerified && (
                      <s-badge tone="success">
                        {r.verification?.provider === "world-selfie"
                          ? "World Selfie Check"
                          : "Verified unique human"}
                      </s-badge>
                    )}
                    {r.mock && (
                      <s-badge tone="warning">Development mock</s-badge>
                    )}
                  </s-stack>
                  {r.reply && <s-paragraph>Store reply: {r.reply}</s-paragraph>}
                  <s-stack direction="inline" gap="small">
                    {["publish", "hide", "delete"].map((intent) => (
                      <s-button
                        key={intent}
                        disabled={
                          f.state !== "idle" || (intent === "publish" && r.mock)
                        }
                        onClick={() =>
                          f.submit({ id: r.id, intent }, { method: "post" })
                        }
                      >
                        {intent[0].toUpperCase() + intent.slice(1)}
                      </s-button>
                    ))}
                  </s-stack>
                  <f.Form method="post">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="intent" value="reply" />
                    <s-text-area
                      label="Public store reply"
                      name="reply"
                      defaultValue={r.reply || ""}
                      maxLength={2000}
                    />
                    <s-button type="submit" disabled={f.state !== "idle"}>
                      Save reply
                    </s-button>
                  </f.Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
        {d.reviews.length === 50 && (
          <s-paragraph>
            Showing the latest 50 reviews. Older-review pagination is a
            documented MVP limitation.
          </s-paragraph>
        )}
      </s-section>
      {!!d.privacy.length && (
        <s-section heading="Customer data requests">
          {d.privacy.map((r) => (
            <s-paragraph key={r.id}>
              <a href={`/app/privacy/${r.id}`} download>
                Download customer data export
              </a>{" "}
              · {new Date(r.createdAt).toLocaleDateString()}
            </s-paragraph>
          ))}
          <s-paragraph>
            Deliver exports through your established customer privacy process.
          </s-paragraph>
        </s-section>
      )}
      <s-section slot="aside" heading="What the badge means">
        <s-paragraph>
          World Selfie Check confirms liveness and facial similarity, with lower
          assurance than Orb verification. A verified unique human badge means
          an Orb-backed proof for this product in your store. It does not prove
          the review is factually true.
        </s-paragraph>
        <s-paragraph>
          You never receive World ID credentials, biometric data, or real-world
          identity from verification.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
