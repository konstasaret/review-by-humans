import "@shopify/ui-extensions/preact";
import { render } from "preact";
import type { Api } from "@shopify/ui-extensions/purchase.thank-you.block.render";
import { ReviewButton } from "./ReviewButton";
declare const shopify: Api;
export default () => render(<Extension />, document.body);
function Extension() {
  return (
    <ReviewButton
      orderId={shopify.orderConfirmation.value?.order.id}
      checkoutToken={shopify.checkoutToken.value}
      appUrl={String(shopify.settings.value.app_url || "")}
      sessionToken={shopify.sessionToken}
    />
  );
}
