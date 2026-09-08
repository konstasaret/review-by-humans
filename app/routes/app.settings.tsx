import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import db from "../db.server";
import { merchant } from "../services/merchant.server";
import { settingsInput } from "../services/policy";
import { boundedForm } from "../services/http.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { merchant: m } = await merchant(request);
  return { settings: m };
}
export async function action({ request }: ActionFunctionArgs) {
  const { merchant: m } = await merchant(request),
    f = await boundedForm(request);
  const result = settingsInput.safeParse({
    delayDays: f.get("delayDays"),
    eligibleProducts: String(f.get("eligibleProducts") || "").replace(
      /\s/g,
      "",
    ),
    eligibleCollections: String(f.get("eligibleCollections") || "").replace(
      /\s/g,
      "",
    ),
    requireWorld: f.get("requireWorld") === "on",
    autoPublish: f.get("autoPublish") === "on",
    widgetEnabled: f.get("widgetEnabled") === "on",
  });
  if (!result.success)
    return {
      ok: false,
      error:
        "Use 0–90 days and comma-separated numeric Shopify product/collection IDs.",
    };
  await db.merchant.update({
    where: { id: m.id },
    data: { ...result.data, onboarded: true },
  });
  // When verification becomes required, existing unverified reviews leave the storefront.
  if (result.data.requireWorld)
    await db.review.updateMany({
      where: { merchantId: m.id, worldVerified: false, status: "published" },
      data: { status: "hidden" },
    });
  return { ok: true, error: null };
}
export default function Settings() {
  const { settings: s } = useLoaderData<typeof loader>(),
    f = useFetcher<typeof action>();
  return (
    <s-page
      heading={
        s.onboarded ? "Review settings" : "Set up World Verified Reviews"
      }
    >
      {f.data && (
        <s-banner tone={f.data.ok ? "success" : "critical"}>
          {f.data.ok
            ? "Settings saved. You're ready to add the theme block."
            : f.data.error}
        </s-banner>
      )}
      <f.Form method="post">
        <s-stack gap="base">
          <s-section heading="1. Reviews from day one">
            <input type="hidden" name="delayDays" value="0" />
            <s-paragraph>
              Customers can review as soon as their order is placed. One review
              per purchased product, with links valid for 30 days. No shipping
              or waiting period is required.
            </s-paragraph>
            <s-text-field
              label="Eligible product IDs"
              name="eligibleProducts"
              defaultValue={s.eligibleProducts}
              placeholder="123456789,987654321"
            />
            <s-text-field
              label="Eligible collection IDs"
              name="eligibleCollections"
              defaultValue={s.eligibleCollections}
              placeholder="123456789"
            />
            <s-paragraph color="subdued">
              Leave both empty for all products. A product matching either list
              is eligible. Find numeric IDs in the product or collection admin
              URL.
            </s-paragraph>
          </s-section>
          <s-section heading="2. Choose verification and moderation">
            <s-checkbox
              label="Require World verification before publishing"
              name="requireWorld"
              value="on"
              defaultChecked={s.requireWorld}
            />
            <s-checkbox
              label="Automatically publish eligible reviews"
              name="autoPublish"
              value="on"
              defaultChecked={s.autoPublish}
            />
            <s-paragraph>
              With automatic publishing off, reviews wait for moderation. When
              World verification is optional, customers can submit a
              purchaser-only review. All star ratings are welcome.
            </s-paragraph>
          </s-section>
          <s-section heading="3. Add your storefront widget">
            <s-checkbox
              label="Enable review widget"
              name="widgetEnabled"
              value="on"
              defaultChecked={s.widgetEnabled}
            />
            <s-paragraph>
              In Online Store → Themes → Customize, open your product template
              and add the World Verified Reviews app block. Drag it into place
              and adjust its heading and accent color.
            </s-paragraph>
            <s-link
              href={`https://${s.shop}/admin/themes/current/editor?template=product`}
              target="_blank"
            >
              Open theme editor
            </s-link>
          </s-section>
          <s-button
            type="submit"
            variant="primary"
            disabled={f.state !== "idle"}
          >
            {f.state === "idle" ? "Save and finish setup" : "Saving…"}
          </s-button>
        </s-stack>
      </f.Form>
    </s-page>
  );
}
