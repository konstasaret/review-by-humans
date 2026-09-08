import "@shopify/ui-extensions/preact";
import { render } from "preact";
import type { Api } from "@shopify/ui-extensions/customer-account.order-status.block.render";
import { ReviewButton } from "./ReviewButton";
declare const shopify: Api;
export default () => render(<Extension />, document.body);
function Extension() {
  return (
    <ReviewButton
      orderId={shopify.order.value?.id}
      checkoutToken={shopify.checkoutToken.value}
      appUrl={String(shopify.settings.value.app_url || "")}
      sessionToken={shopify.sessionToken}
    />
  );
}
