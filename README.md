# World Verified Reviews

Standalone Shopify public-app MVP: fulfilled-order invitations, product reviews, privacy-preserving World ID verification, embedded moderation, and a Theme App Extension. Based on Shopify's official React Router template. The project is linked to the Shopify app **reviews by humans**; its client ID is public configuration, not a secret.

**Implemented and tested in a Shopify development store; real World proof acceptance and production services are still required before release.** No review-platform integrations are included.

## Quick start

Requires Node 24, npm, and SQLite (provided through Prisma; no separate database server).

```sh
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Put the generated value in DATA_ENCRYPTION_KEY. Never commit .env.
npm run setup
npm test
```

For a standalone reviewer demo, set a nonempty development placeholder for `SHOPIFY_API_KEY` and a random `SHOPIFY_API_SECRET`, set `SHOPIFY_APP_URL=http://localhost:3000`, and keep `WORLD_PROVIDER=mock`:

```sh
npm run seed:demo
npm run dev:standalone -- --port 3000
```

Open the URL printed by the seed command. It is a **synthetic order**, not a verified Shopify purchase. Each seed creates a fresh invitation; reuse a test human label on the same product to exercise duplicate prevention. Mock reviews remain pending and cannot be published. The merchant admin has no authentication bypass; test it inside Shopify.

## Shopify configuration

1. Use the linked app or run `npm run config:link -- --client-id YOUR_CLIENT_ID` for another app. Linking downloads remote settings; retain this repository's scopes, webhook subscriptions, and app proxy configuration when merging. Select **Public distribution** in the Partner/Dev Dashboard; do not select custom distribution. `AppDistribution.AppStore` is set in the server. Distribution eligibility and App Store approval are separate from local configuration. The current account has no Partner organization yet; signup is paused at business country/region. Create the Partner organization before configuring public distribution; the development app remains usable for testing.
2. The development store **reviews-by-humans-dev.myshopify.com** has been created with sample data. Run `npm run dev -- --store reviews-by-humans-dev.myshopify.com`. The CLI authenticates, supplies app credentials, creates a development tunnel, and manages preview URLs. No live merchant store is needed. Install the preview and open its embedded admin.
3. Grant `read_products`, `read_orders`, and `write_app_proxy`. Request protected customer data access for order email/customer ID where required. The app does not request historical `read_all_orders` or product-write access. Configure the contact/privacy details and mandatory compliance webhooks before public review.
4. Complete Settings in the app. Add the **World Verified Reviews** app block to a product template in the theme editor. The block supports heading and accent color; drag it to set placement. Keep the app-proxy prefix/path `apps/world-reviews` unchanged for this MVP.
5. Place and fully fulfill a development order with an email and a real product. Set delay to zero **before fulfillment** for quick testing. Run `SHOPIFY_APP_URL=https://YOUR-CURRENT-TUNNEL npm run invitations:send` (use the HTTPS URL printed by the CLI), open the matching JSON in `work/outbox`, and follow its review URL. The development sender writes files only; it does not send email.

`shopify.app.toml` registers `orders/fulfilled`, `orders/cancelled`, `refunds/create`, `app/uninstalled`, `app/scopes_update`, and all three mandatory privacy topics. Shopify's SDK verifies webhook HMACs, embedded admin sessions, and storefront app-proxy signatures.

The current MVP waits for **full order fulfillment**. Refunds conservatively revoke every invitation and hide all reviews for the refunded order, even for partial refunds. Product/collection filters are evaluated when the fulfillment event is received. Later settings changes do not reschedule existing invitations; turning required verification on immediately hides existing unverified reviews.

## World ID and Selfie Check configuration

The integration uses `@worldcoin/idkit` 4, server-side RP request signing, and `POST https://developer.world.org/api/v4/verify/{rp_id}`. Orb-backed Proof of Human is the default and active verification flow. Selfie Check is optional code and is not enabled by default. No live proof or camera check has been claimed as tested.

1. For **Selfie Check**, set `WORLD_CREDENTIAL=selfie`. Request Selfie Check Beta access for your World app through the World Developer Portal / developers@toolsforhumanity.com. It is access-gated. Add `WORLD_APP_ID`, `WORLD_RP_ID`, and the matching `WORLD_SIGNING_KEY` to `.env` or your secret manager, then set `WORLD_PROVIDER=world`. Shopify credentials are separate. Never paste the signing key into GitHub or commit it.
2. The reviewer button opens IDKit's `selfieCheckLegacy` flow: a QR code on desktop or a World App handoff on mobile. World App performs the camera check; this app never captures or receives the selfie. The backend accepts only a production World ID 3.0 `selfie` proof in this mode, binds its signal hash to the invitation challenge, forwards the result unchanged, and requires a matching successful remote verification. Orb, device, session, staging, wrong-signal, and wrong-action proofs fail closed.
3. For **Orb-backed Proof of Human**, set `WORLD_CREDENTIAL=proof_of_human` and also configure `WORLD_ISSUER_SCHEMA_ID`. This mode uses `proofOfHuman`, accepts only native protocol 4.0, and retains the **Verified unique human** badge. Selfie mode uses the distinct **World Selfie Check** badge: it provides liveness/facial-similarity checks, not a strict one-person-one-account guarantee. The internal `Review.worldVerified` field means an accepted World credential; the persisted verification provider determines the displayed badge. Public responses expose only the corresponding badge booleans.
4. Run `npm run world:actions` after fulfillment has provisioned products, and register each exact action in your World's production app configuration as required. Complete a real camera/proof flow and repeat with a second invitation for the same store/product before release. Action provisioning remains manual. Choose one credential mode before launch: changing credential systems does not link their identities and requires an explicit migration plan.

The action is `review-` plus SHA-256 of the canonical Shopify store domain and product ID. The server pins action, nonce, environment, protocol, credential, and verifier outcome. It forwards the original proof unchanged, canonicalizes the verified nullifier with `BigInt`, and immediately HMACs it with the action scope. Only this opaque digest, provider, and verification timestamp are persisted. Repeated credential nullifiers are blocked by the database; this does not make Selfie Check a stronger uniqueness guarantee than World provides. Raw proofs/nullifiers are never persisted or returned to merchants.

Mock mode stays visibly labeled, does not open a camera/World flow, and cannot publish reviews. Supplying an app ID and RP ID alone is insufficient: real requests also need an RP signing key and Selfie Check access.

### Sandbox Selfie Check

Set `WORLD_PROVIDER=world`, `WORLD_CREDENTIAL=selfie`, and `WORLD_ENVIRONMENT=sandbox`, with your World app/RP/signing credentials. Restart the dev server after changing `.env`. The IDKit widget uses `environment: sandbox`; proofs still go to the standard production verify endpoint, as World documents. Both the incoming proof and verifier response must match the configured environment.

Install **World ID Sandbox**, not the regular World app. Request tester enrollment in the World Developer Portal → World ID Sandbox for your Apple Account (TestFlight) or Google Play account (private testing track). Selfie Check must also be enabled for your app. See [World sandbox setup](https://docs.world.org/world-id/sandbox/sandbox-access).

Sandbox is labeled on the reviewer form. A successful sandbox proof is stored as a private test with a sandbox provider and a separate digest namespace, never a production verification. Auto-publishing, manual publishing, and storefront display remain blocked for these records. `NODE_ENV=production` rejects sandbox configuration. The internal `mock` field means a non-production test record (local mock or World sandbox); provider metadata distinguishes the two.

The sandbox QR handoff has been exercised locally. A complete phone capture and returned sandbox proof still require testing on an enrolled device; automated verifier tests use stub responses.

## Environment

| Variable                                                                     | Purpose                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                               | SQLite URI, relative to `prisma/`, or absolute `file:/data/reviews.sqlite`            |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`                                      | Shopify client ID and secret; CLI supplies them for embedded development              |
| `SHOPIFY_APP_URL`, `SCOPES`                                                  | Public HTTPS app URL and Shopify access scopes; localhost only for standalone demo    |
| `DATA_ENCRYPTION_KEY`                                                        | Stable 32-byte hex key for AES-256-GCM and scoped HMAC; keep in a secret manager      |
| `WORLD_PROVIDER`                                                             | `mock` for development, `world` for real verification; mock is rejected in production |
| `WORLD_ENVIRONMENT` | `production` by default; `sandbox` for isolated integration tests, forbidden in production deployments |
| `WORLD_CREDENTIAL` | `selfie` for Selfie Check Beta; `proof_of_human` for Orb-backed v4 |
| `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, `WORLD_ISSUER_SCHEMA_ID` | World configuration; signing key stays on the server                                  |
| `DEV_OUTBOX_DIR`                                                             | Development email directory; defaults to `work/outbox`                                |
| `NODE_ENV`                                                                   | Set to `production` in deployed environments                                          |

Do not rotate the data key casually: existing encrypted tokens/emails and duplicate-prevention digests depend on it. Rotation needs a planned data migration. Shopify access and refresh tokens are encrypted through the session storage adapter. Never expose environment files, Prisma databases, or outbox contents in the web root.

## Architecture and behavior

```text
Shopify OAuth / App Bridge → authenticated merchant dashboard
Signed fulfilled-order webhook → eligibility → order/product/invitation
Single scheduled worker → EmailSender → expiring bearer invitation
Reviewer → World provider → server verification → atomic review + uniqueness row
Signed Shopify app proxy → published safe fields → Theme App Extension
```

Prisma models: Merchant, Product, Order, Invitation, Review, Verification, PrivacyRequest, and encrypted Shopify Session. Database uniqueness on `(merchantId, productId, digest)` prevents concurrent duplicate humans. Invitation consumption and review/verification creation occur in one transaction. A duplicate rolls back consumption, so another eligible person may complete that invitation. One invitation is created per order/product, including orders with multiple units or variants of that product.

Merchant actions are shop-scoped. Moderators can publish, hide, delete, and reply without rating-based restrictions. Public responses omit email, order/customer IDs, verification digests, proof data, and merchant credentials. User content is rendered as text, never HTML. Mock records are filtered from the widget and forbidden from manual publication.

“Verified purchaser” means possession of an invitation linked to a real fulfilled order; a forwarded link could be used by someone else. It does not independently authenticate the buyer. “Verified unique human” means a successful scoped proof, not that a review is true or unbiased. No rewards or positive-review incentives exist.

## Order confirmation review button

The active invitation flow is a **Write a review** block on both Shopify's Thank you and Order status pages. No external email provider is needed. In Settings → Checkout → Edit, add **World Verified Reviews** to both pages and set **Review app URL** to the app's public HTTPS URL (the current CLI tunnel while developing), then save. Shopify documents these [order-page extension targets](https://shopify.dev/docs/apps/build/checkout/thank-you-order-status).

After fulfillment and the configured delay, clicking the button lists eligible products and opens their existing Orb verification form. Before then, it shows a waiting message. Expired, consumed, refunded, and cancelled invitations cannot be opened as new reviews. The page does not depend on running the invitation email worker, and orders without email can use it.

The backend validates Shopify's signed extension session and the app audience, then requires a matching checkout secret (stored only as a keyed digest from the signed fulfillment webhook) or a matching signed customer identity. A shop or order ID alone cannot retrieve review links. Older ingested orders without a checkout digest require the matching signed customer or a replay of their genuine fulfillment event. The extension needs network access; confirm approval in the app's extension settings before public distribution. Both blocks have been added and saved in the development store. The Order status button was exercised in the editor and reached the backend successfully. The development editor uses simulated orders, so its waiting state is expected; use a newly fulfilled test order for end-to-end testing.

## Email and operations

`EmailSender` is a replaceable interface. The included `DevelopmentEmailSender` is **file-only** and throws in production. Implement a production provider with a stable invitation ID as its idempotency key, verified sending domain, bounce/suppression handling, and appropriate review-email consent handling before launch.

Run `npm run invitations:send` from **one scheduler/worker** every minute in development. Each run handles up to 100 due invitations. A failed delivery remains retryable. Token and delivery IDs are stable across retries; a production provider must deduplicate a crash between delivery and recording `sentAt`. No in-process timer or hosted scheduler has been deployed.

Use the same database and encryption key for web and worker. Set SHOPIFY_APP_URL at build time too: the React Router action-origin allowlist uses its exact hostname so saves work behind the Shopify tunnel/reverse proxy. For production, use an encrypted persistent volume, restricted file permissions, HTTPS, access-log redaction for `/review/*` and `/api/review/*`, body/log redaction, ingress rate limits, backups, and a tested restore procedure. The provided Dockerfile runs as a non-root user; set `DATABASE_URL=file:/data/reviews.sqlite` and mount `/data`. SQLite is for a single application instance; PostgreSQL migration and distributed job leasing are future scaling work.

## Privacy and deletion

- Verification never requests or stores biometrics, World ID identity credentials, names, or a reusable global human identifier. The store already has its Shopify order information; World verification adds no real-world identity. Review text can contain personal data, so the form asks users to leave it out.
- Order email and invitation token are encrypted. Invitation links are 256-bit bearer secrets, stored as hashes for lookup and encrypted only for delivery retries. They expire 30 days after their due date. The worker removes expired link secrets and unnecessary email, plus expired development outbox files. Do not record full invitation URLs in analytics or access logs. Public review responses use `no-store` and `no-referrer`.
- Uninstall and shop-redaction delete merchant data and OAuth sessions. Customer redaction deletes their orders, invitations, reviews, and associated verification values. Development outbox files are removed before database erasure. Database backups must follow the deployment operator's deletion policy; no hosted backup system is included.
- Manual review deletion retains only the scoped anti-duplication tombstone, so deleting and resubmitting cannot bypass uniqueness. It no longer points to review content. Full customer erasure removes values still associated with retained customer reviews; already detached tombstones cannot identify or be linked back to that customer. Shop deletion removes all tombstones. These retention assumptions need confirmation for the operating jurisdiction before launch.
- Customer data-request webhooks create a dashboard task with an authenticated JSON export. The merchant must deliver that export via its privacy process. The export excludes internal verification values. Guest requests lacking a customer ID need operator handling in this MVP.

## Validation

```sh
npm test               # temporary isolated SQLite database; never resets your dev DB
npm run typecheck
npm run lint
npm run build
npm audit
npm run shopify -- app config validate --json
```

35 automated tests cover eligibility, required/optional proofs, mock-production guards, verifier failures/context mismatches, nullifier canonicalization, database duplicate/race prevention, per-store authorization, fulfillment idempotency, cancellation, email retries, erasure, encrypted sessions, webhook HMAC, origin checks, and bounded request bodies. Tests include selfie credential/protocol/signal rejection and duplicate selfie prevention. Real adapter tests stub the remote verifier; they are not real World verifications. `docs/github-actions-ci.example.yml` is a ready-to-enable GitHub Actions workflow for Node 24. The available GitHub token cannot create active workflow files; copy it to `.github/workflows/ci.yml` using a credential with workflow permission to enable CI.

The reviewer form has been exercised in a browser with both a synthetic order and a real Shopify development-order invitation, using a development mock. The live test covered embedded authentication, settings save, full fulfillment webhook delivery, file-only invitation delivery, and private mock review submission. The app block was added and saved to the development product template; the signed app proxy successfully returned its empty state. Shopify GraphQL, theme block, and linked app configuration pass Shopify validators. Both merchant screens pass the Polaris toolkit validator after pinning its TypeScript runtime; local TypeScript checks also pass.

## Known MVP limits / release gates

1. Shopify development preview authentication, settings, fulfillment webhook delivery, mock review submission, and theme placement have been verified on reviews-by-humans-dev.myshopify.com. Publication of a real World-verified review still needs end-to-end validation. Public distribution and App Store review are not established just by the server's `AppStore` setting.
2. A matching World signing key, Selfie Check access (for selfie mode), and per-product action provisioning are required. Selfie Check uses legacy 3.0 and its own medium-assurance badge; Orb-backed Proof of Human uses 4.0. No production email provider or hosted scheduler is included.
3. No media uploads, review editing, reminders, review-platform integrations, payments/billing, historical backfill, or advanced spam classifier. Admin and widget show the latest 50 reviews; full pagination is not implemented.
4. Dashboard metrics describe retained records, not an immutable analytics ledger; deleting reviews changes counts. Completion is successful real World verifications divided by reviews started. Email preview files count as “sent” in development only.
5. The public storefront app-proxy subpath must remain `world-reviews`. Fulfillment ingestion requires full order fulfillment and valid order email. Production rollout still needs operational rate limits, privacy policy/contact details, protected customer data approval, and an end-to-end live test.

## Official references

[Shopify React Router scaffold](https://shopify.dev/docs/apps/build/scaffold-app), [Polaris web components](https://shopify.dev/docs/api/app-home/latest/web-components), [development stores](https://shopify.dev/docs/apps/build/stores/development-stores), [distribution](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method), [World IDKit](https://docs.world.org/world-id/idkit/integrate), [Selfie Check](https://docs.world.org/world-id/credentials/11), and [World backend verify API](https://docs.world.org/api-reference/developer-portal/verify).
