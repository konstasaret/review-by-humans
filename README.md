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

## World ID configuration

The real integration uses `@worldcoin/idkit` 4, server-side RP request signing, and `POST https://developer.world.org/api/v4/verify/{rp_id}`. No credentials were included with this project, and no live proof has been claimed as tested.

1. Register an app/RP in the World Developer Portal. Set `WORLD_PROVIDER=world`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, and `WORLD_ISSUER_SCHEMA_ID` to the approved **proof_of_human** issuer schema. The backend enforces the issuer schema as well as the credential identifier.
2. Run `npm run world:actions` after products have been provisioned by fulfillment events. Configure the exact generated actions in World’s **production** environment as required by your RP/Portal setup. Action provisioning is manual in this MVP; arbitrary unregistered actions are not assumed to work.
3. Use a World ID 4 credential with `proofOfHuman`. Legacy 3.0 and session proofs are deliberately rejected to avoid separate protocol identities weakening lifetime duplicate prevention. The simulator/staging environment is not accepted for production badges.
4. Complete one live proof, then repeat from a second invitation for the same store/product; verify rejection. Repeat for a different product/store; verify acceptance. Do this before claiming production readiness.

The action is `review-` plus SHA-256 of the canonical Shopify store domain and product ID. The server pins action, nonce, environment, protocol, credential identifier, issuer schema, and verifier outcome. It forwards the original proof unchanged, checks the remote success result, canonicalizes the nullifier with `BigInt`, and immediately HMACs it with the action scope. Only this opaque digest, provider, and verification timestamp are persisted. Raw proofs/nullifiers are never persisted or returned to merchants. Do not replace the scoped action with a global action or move uniqueness into a mere signal.

## Environment

| Variable                                                                     | Purpose                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                               | SQLite URI, relative to `prisma/`, or absolute `file:/data/reviews.sqlite`            |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`                                      | Shopify client ID and secret; CLI supplies them for embedded development              |
| `SHOPIFY_APP_URL`, `SCOPES`                                                  | Public HTTPS app URL and Shopify access scopes; localhost only for standalone demo    |
| `DATA_ENCRYPTION_KEY`                                                        | Stable 32-byte hex key for AES-256-GCM and scoped HMAC; keep in a secret manager      |
| `WORLD_PROVIDER`                                                             | `mock` for development, `world` for real verification; mock is rejected in production |
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

29 automated tests cover eligibility, required/optional proofs, mock-production guards, verifier failures/context mismatches, nullifier canonicalization, database duplicate/race prevention, per-store authorization, fulfillment idempotency, cancellation, email retries, erasure, encrypted sessions, webhook HMAC, origin checks, and bounded request bodies. Real adapter tests stub the remote verifier; they are not real World verifications. `docs/github-actions-ci.example.yml` is a ready-to-enable GitHub Actions workflow for Node 24. The available GitHub token cannot create active workflow files; copy it to `.github/workflows/ci.yml` using a credential with workflow permission to enable CI.

The reviewer form has been exercised in a browser with both a synthetic order and a real Shopify development-order invitation, using a development mock. The live test covered embedded authentication, settings save, full fulfillment webhook delivery, file-only invitation delivery, and private mock review submission. The app block was added and saved to the development product template; the signed app proxy successfully returned its empty state. Shopify GraphQL, theme block, and linked app configuration pass Shopify validators. Both merchant screens pass the Polaris toolkit validator after pinning its TypeScript runtime; local TypeScript checks also pass.

## Known MVP limits / release gates

1. Shopify development preview authentication, settings, fulfillment webhook delivery, mock review submission, and theme placement have been verified on reviews-by-humans-dev.myshopify.com. Publication of a real World-verified review still needs end-to-end validation. Public distribution and App Store review are not established just by the server's `AppStore` setting.
2. Real World credentials and per-product action provisioning are required. World 4-only users are supported; legacy users cannot get a badge. No production email provider or hosted scheduler is included.
3. No media uploads, review editing, reminders, review-platform integrations, payments/billing, historical backfill, or advanced spam classifier. Admin and widget show the latest 50 reviews; full pagination is not implemented.
4. Dashboard metrics describe retained records, not an immutable analytics ledger; deleting reviews changes counts. Completion is successful real World verifications divided by reviews started. Email preview files count as “sent” in development only.
5. The public storefront app-proxy subpath must remain `world-reviews`. Fulfillment ingestion requires full order fulfillment and valid order email. Production rollout still needs operational rate limits, privacy policy/contact details, protected customer data approval, and an end-to-end live test.

## Official references

[Shopify React Router scaffold](https://shopify.dev/docs/apps/build/scaffold-app), [Polaris web components](https://shopify.dev/docs/api/app-home/latest/web-components), [development stores](https://shopify.dev/docs/apps/build/stores/development-stores), [distribution](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method), [World IDKit](https://docs.world.org/world-id/idkit/integrate), and [World backend verify API](https://docs.world.org/api-reference/developer-portal/verify).
