# Order review button

2026-07 Preact UI extension for `purchase.thank-you.block.render` and `customer-account.order-status.block.render`.

Add the block to both pages in Shopify checkout settings and set its Review app URL to the public HTTPS app URL. The backend checks the Shopify session plus order-specific checkout access before providing bearer review links. Reviews remain gated by order placement, expiry, cancellation, and one-use rules.

Run `npm run typecheck`, `npm test`, and `shopify app build` from the repository root.
