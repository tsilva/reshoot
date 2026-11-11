# Production delivery

Production builds remove Sentry's internal debug statements with the Next.js
compiler so the existing webpack policy also applies to Turbopack. Error
capture, performance tracing and configured warning/error logs are preserved.
For SDK internal debugging, rebuild without the `__SENTRY_DEBUG__` definition.

## Provider cost ledger

Automatic delivery accepts only successful main-push CI from this repository,
for the same SHA as the delivery run and the current head of `main`. The CI
workflow path, immutable repository IDs, run ID and rerun attempt are checked
again against GitHub before secret access. Failed, cancelled, forked, stale or
superseded runs cannot deploy. Manual and secret-change relay dispatches remain
available, but fail immediately if the latest exact-commit CI is not already
successful. CI artifacts and caches are not imported into the trusted sync job.

Migration `0005_provider_cost_tracking` must be applied through the authorized
database migration procedure before deploying the cost-tracking worker and
automatic naming code. It adds `provider_calls` and imports recorded image
attempts without changing customer credits, pricing or subscription records.
Historical zero/unknown costs remain unresolved; historical naming spend is
unavailable. No migration is applied automatically during startup or delivery.

The operator reporting/reconciliation endpoint
`/api/internal/provider-costs?projectId=<uuid>` requires `CRON_SECRET` in every
environment. GET reads stored costs only; POST performs bounded read-only usage
metadata checks with the matching hosted provider account. Neither invokes the
existing general reconciliation/cleanup route. The existing credential-delivery
allowlist and agent service bindings remain unchanged; configuration metadata
does not grant agent access to the operator token or application database.
No cron schedule is enabled. See the README's Provider cost accounting section
for completeness rules and the distinction between provider spend and credits.

## Clerk accounts and Stripe test payments

The native Clerk/Vercel integration supplies private, environment-specific API
keys to the connected Production and Preview environments. This is the approved
exception to the Infisical source policy. Do not copy these keys into Infisical,
add them to the shared sync allowlist, or overwrite the provider-managed values.
Production and Preview use separate Clerk instances and keys.

| Setting | Source | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Native Clerk/Vercel integration | Public Clerk frontend identifier |
| `CLERK_SECRET_KEY` | Native Clerk/Vercel integration | Server-only Clerk backend access |
| `RESHOOT_PAYMENTS_MODE` | Production Infisical vault, public configuration | `stripe_test` enables sandbox checkout; all other values disable it |

Clerk settings must be present at build and runtime. Production builds reject
missing keys. Unconfigured local or Preview builds close private access while
retaining public samples. Complete Clerk domain and certificate verification
before delivery. Clerk CNAMEs must resolve directly to the provider; required
integration and Production assignment checks remain enforced.

Migration `0003_flimsy_joseph` adds the nullable, unique Clerk user ID and retains
all existing users, projects, and balances. Apply it through the authorized
migration procedure before using the new account code; the read-only migration
check verifies its ledger timestamp and hash without applying it again.

New accounts begin with empty wallets. Only the server catalog determines credit
grants, and repeated delivery of a purchase cannot grant twice. A decline or
cancellation adds no credits. Live Stripe payments and automatic recharge remain
disabled. Existing shared-demo and legacy records are preserved.

### Stripe test checkout

Monthly plans use Stripe-hosted subscription Checkout and a Stripe-hosted customer portal. Stripe is authoritative for billing, customer IDs, subscription IDs, renewal dates and cancellation status. Reshoot mirrors these in `subscriptions`; `subscription_invoices` deduplicates paid billing periods, while the existing Neon credit ledger enforces usage. The additive `0004_monthly_subscriptions` migration must be applied through the authorized database procedure before deploying this code. It does not convert or expire existing one-time credits.

The current integration is **test-only**. No account, product, recurring price, portal configuration, subscription or webhook destination is created by the repository. The user must perform Stripe account/billing setup and any Checkout submissions directly, including in a sandbox. Do not submit payments or change payment methods through agent tools.

Required runtime configuration:

| Setting | Required value |
| --- | --- |
| `RESHOOT_PAYMENTS_MODE` | `stripe_test`; all other modes disable checkout |
| `STRIPE_TEST_SECRET_KEY` | Restricted sandbox key; live keys are rejected |
| `STRIPE_TEST_WEBHOOK_SECRET` | Signing secret for this environment's endpoint |
| `STRIPE_TEST_STARTER_MONTHLY_PRICE_ID` | USD $15, recurring every one month, quantity 1 |
| `STRIPE_TEST_STUDIO_MONTHLY_PRICE_ID` | USD $29, recurring every one month, quantity 1 |
| `STRIPE_TEST_PRO_MONTHLY_PRICE_ID` | USD $89, recurring every one month, quantity 1 |
| `STRIPE_TEST_PORTAL_CONFIGURATION_ID` | Active sandbox portal configuration, cancellation at period end enabled, subscription updates disabled |

Each Price must use licensed recurring billing and match the server catalog exactly. The allowances are respectively 750, 3,000 and 8,000 credits. No trials, discounts, prorations, mid-cycle changes, top-ups or annual plans are supported. Studio has the lowest price per credit. Checkout validates the chosen Price and portal configuration before creating a session; a missing cancellation path disables new subscriptions. The portal may display invoices and payment settings; all account changes remain customer-operated.

Use separate sandbox bindings for Development/Preview and Production. Store secret values in each matching Infisical vault. Price and portal IDs are non-secret server configuration. The pinned trusted delivery allowlist supplies these names from the isolated Production vault; source changes do not provision credentials or expand access. Preserve native Clerk keys and Require Separate Values. Ordinary local agent access requires a separately reviewed sandboxed Stripe proxy and a compatible incoming-signature flow; do not use raw injection or cached credentials as a fallback.

The endpoint `/api/stripe/webhook` verifies the raw-body signature and rejects live events. Configure snapshot events using API version `2026-10-28.endive`:

- `invoice.paid`: retrieve and validate the paid invoice; grant one monthly allowance only for initial/cycle invoices matching the server catalog, customer and subscription.
- `invoice.payment_failed`, `invoice.payment_action_required`: refresh subscription state without granting credits.
- `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`: retrieve current state while holding the account lock, so delayed events cannot restore stale state.
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`: refresh state for subscriptions. Existing one-time paid test sessions retain their original fulfillment path.

Invoice ID and subscription/period uniqueness prevent duplicate grants. Old invoices cannot refresh a newer allowance. The account lock serializes renewal, expiry, reservation and settlement. Expiry is enforced both by quote affordability and at generation confirmation, even without a cron job. Held jobs retain their original funding period; failure refunds only still-valid monthly credits and any legacy portion. Legacy credit balances never expire. Scheduled cancellation preserves paid usage through its allowance expiry. A failed renewal does not grant another month.

`POST /api/account/subscription-checkouts` authenticates and checks same origin, reserves one pending checkout per account, then redirects to `checkout.stripe.com`. Retries use the same persisted idempotency key and expiry. Pending sessions last about 31 minutes. Before allowing another checkout, the server inspects the prior session for a subscription that may still be awaiting its webhook. An unresolved create whose session ID was never recorded fails closed for operator reconciliation. `GET /api/account/subscription-checkouts/<session-id>` verifies ownership and reads fulfillment; it never grants credits. `POST /api/account/subscription-portal` opens only the account's Stripe customer and the reviewed configuration on `billing.stripe.com`. Plan switching is disabled in this initial release. The previous top-up POST routes return 410.

Before activation, apply and audit the migration, supply the reviewed configuration, and verify webhook delivery and the customer return flow against the exact deployed commit. Offline tests cover the lifecycle without making Stripe calls. Real sandbox delivery, database migration, and real-money billing are separate verification/activation steps. Refunds, disputes and out-of-band catalog changes require operator review; this release does not automatically reverse an already-used allowance.

### Google sign-in

Google authentication is a Clerk social connection. The existing `/login` and
`/sign-up` components render enabled providers automatically, and account
ownership remains tied to the verified Clerk user ID.

For Production, create a dedicated Google OAuth web client and configure its
custom credentials in the Production Clerk instance. Use the exact **Authorized
Redirect URI** shown by Clerk; for the current Production domain this is
`https://clerk.reshoot.tsilva.eu/v1/oauth_callback`. The JavaScript origin is
`https://reshoot.tsilva.eu`. Enable the connection and **Enable for sign-up and
sign-in**. Retain only the default `openid`, `userinfo.email`, and
`userinfo.profile` scopes. Google client secrets stay in Clerk and must not be
copied into application variables, source, or delivery logs. Preview and
Development use their own Clerk instance settings.

Prefer Google's **In production** publishing status. Publishing requires the
app's public branding and policy links to be complete. After deploying reviewed
policy text, set the Google branding homepage to `https://reshoot.tsilva.eu`,
privacy link to `https://reshoot.tsilva.eu/privacy`, and terms link to
`https://reshoot.tsilva.eu/terms`. Verify that the home page links to both policies,
that they open without sign-in and return HTTP 200, and that Google has accepted
any required branding/domain verification before publishing the OAuth app.
Never substitute a missing policy URL or claim Google's publishing status changed
until the console confirms **In production**. Google's documented
exception for identity-only scopes also allows sign-in while the OAuth app is
in **Testing**, without requiring a test-user list or expiring authorization
after seven days. Adding other scopes removes that exception. See
[Google's audience rules](https://support.google.com/cloud/answer/15549945) and
[Clerk's Google setup guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google).

Verify the button on both authentication pages, the redirect to Google with the
expected client, callback and scopes, and a completed return to Reshoot after
the user finishes any passkey or consent prompts. Button visibility and an
account chooser alone do not establish a completed sign-in. Use the configured
external browser; Google OAuth does not support embedded WebViews. A provider
configuration change takes effect without rebuilding the application.

## Neon Realtime rollout

Development uses Realtime on the `development` branch of `reshoot-neon`; its URL and sealing secret live in Development `/` in the existing Reshoot Infisical project. Production uses the separate `main` branch, migration `0002_generation_realtime`, and that branch's `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET` in `reshoot-production`, Production `/`. Both branches are enabled and migrated; their sealing secrets differ. The secret stays server-only; only sealed, owner-and-batch-scoped capabilities reach browsers.

The pinned trusted shared workflow includes both names in Reshoot's allowlist: `NEON_REALTIME_URL` is public configuration and `NEON_REALTIME_SECRET` is a private Secret. Production delivery synchronizes them before deploying the exact app commit. Infisical's OIDC policy must permit the reviewed `96ac6c21c4db6087757d4d65907119fec0f8f26f` pin before deployment, retaining `1daa3f918e5d6948722a9146db0062f9594a8583`, `c4ec8c69f883e84aba8ee8604f75c579ae40460b` and `e0c6d64d4fc917ea0e108d27ce8d1a5304aeb3c6` for callers that have not migrated; caller identity, main-branch, Production-subject and 900-second TTL restrictions remain enforced. Removing the previous pin requires a separate caller migration. Scheduled pricing reconciliation, retention cleanup and real billing remain disabled.

After a rollout, verify the exact commit's READY state and domain assignment, authenticated subscription sealing, workspace isolation, live batch changes and reconnects. Use isolated, temporary workspace fixtures with no jobs or credit grants for the Production smoke check; remove their exact records afterward. Paid execution and credit settlement are covered by the disposable-database and mocked accounting tests, without issuing paid image requests during deployment verification.

For rollback, retain the additive revision table and triggers while rolling application code back. Realtime setup does not alter generation records or existing holds. Older application versions resume their previous status polling; do not run both clients for the same page.

A successful `CI` completion for a push to `main` triggers `.github/workflows/production-delivery.yml` through `workflow_run`. After secret scanning, it calls the trusted workflow in public `tsilva/.github`, pinned to a reviewed full commit SHA. The privileged job checks out only the shared implementation, rechecks the same latest main commit's already successful CI, and syncs its fixed Production allowlist. A separate GitHub Actions job builds the exact commit, stages its prebuilt artifact on Vercel, verifies that deployment, then promotes it to production. Vercel's automatic Git deployments remain disabled so they cannot race synchronization.

Infisical remains the source of application secrets except the two native Clerk keys described above. Development uses the existing human CLI login. The shared GitHub reader has Viewer access to the assigned production vaults, and the completed rollout requires its server-side OIDC policy to match the exact approved reusable workflow revision, caller repository IDs, owner ID, main branch and Production context. The trusted `apps.json` selects the source vault and destination from the immutable caller repository ID; app files and inputs cannot change that mapping. The reader itself can access all assigned vaults inside the trusted job. The Infisical reader token stays in the trusted job, which sends the allowlisted values only to their configured Production destination. The Vercel deployment credential remains in this repository's GitHub Production environment.

The pinned shared source and [trust contract](https://github.com/tsilva/.github/blob/c262be7b75fe4654c170eb5e13240808a70b9936/.github/actions/production-delivery/README.md) are authoritative. App repositories retain only the pinned caller workflow. Source/destination mappings, credential handling and boundary tests are maintained centrally; no app code executes in the privileged job.

The workflow does not run on pull requests or forks, export `.env` files, upload secret artifacts, delete secret variables, or change preview/development variables. All required source keys and destination targets are checked before writes. Failed CI or sync prevents deployment. Existing production remains live on failure.

Automatic secret-change delivery uses a standalone Cloudflare Worker with a private GitHub App, independent of application deployments. Each vault's signed General webhook is restricted to `prod`, `/`, and `secrets.modified`. The relay receives event metadata and never fetches application secrets. It verifies raw-body HMACs and timestamps, stores pending routing metadata durably, coalesces bursts and retries dispatches during GitHub outages. A per-repository installation token starts only the fixed entry workflow on `main`. The relay endpoint is `https://production-deployment-relay.tsilva-production-delivery.workers.dev/infisical`. Webhook activation and per-app live verification are required before calling the automatic path operational.

Use **Actions → Production delivery → Run workflow → main** to recover after fixing a failed workflow. A relay acknowledgement confirms durable acceptance, and a GitHub dispatch acknowledgement confirms only that the run was accepted. Neither confirms deployment success. There is no polling schedule. Deployment credentials expire after one year and need rotation before expiry.

Native Infisical syncs are disabled after this workflow has successfully replaced them. Updating a deployment credential in GitHub does not replace application keys in Infisical.

## R2 environments

Configured and verified on 2026-10-14:

| Environment | Private bucket | Cloudflare account token | Infisical source |
| --- | --- | --- | --- |
| Local development / Vercel Preview | `reshoot-development` | `reshoot-development-20261014` | Linked `reshoot` project, Development `/` |
| Production | `reshoot` | `reshoot-production-20261014` | `reshoot-production`, Production `/` |

Both tokens permit Object Read & Write only on their named bucket and expire
on October 14, 2027. Rotate before expiry. Development's bucket allows signed
browser requests from any origin to support automatic local ports; its public
development URL and custom domains remain disabled. Direct browser requests to
private storage use signed URLs. Generation finalization saves a ZIP of the
gallery views in the same private bucket. The gallery prepares a missing ZIP
for older shoots when opened. Downloads stream the stored ZIP through Reshoot
after checking workspace ownership and require no bucket CORS rule. Project
deletion removes current and legacy ZIPs immediately, before confirming success.
ZIP publication and deletion share a project row lock so an in-progress export
cannot recreate the ZIP afterward. Bucket deletion failures roll back the
project's soft deletion for retry. Retention cleanup also removes leftover ZIPs,
even when no generated image records remain; image retention keeps its existing
30-day policy. These paths do not enable scheduled retention cleanup.

Preview uses the working Development database source so its asset references
match the Development bucket. Existing Development-referenced objects were
copied and checked before switching; Production objects were not moved.

For rotation, create an overlapping replacement restricted to the same bucket,
verify a synthetic upload/read/delete and denial on the other bucket, update
the corresponding Infisical source and Vercel environment, and redeploy. Verify
browser upload, finalized preview, and existing object access before revoking
the old token. Allow outstanding signed URLs to drain before revocation.
Historical deployments freeze credentials: after revocation, rebuild an older
application commit with current environment values before rolling back.

Production and Preview call OpenRouter directly with their own server-only `OPENROUTER_API_KEY`. Production delivery reads this key only from this app’s isolated production Infisical project; it never copies a development key. Missing production keys fail closed. AgentBridge is used only for development. The shared text-routing default is `deepseek/deepseek-v4.1-flash-1017`. Image generation retains the supported image models; DeepSeek is not an image generator.

Secret synchronization updates an existing Production variable by its exact Vercel ID, preserving separately configured Preview rows. New variables are created only when Production has no matching row; duplicate or combined targets still stop delivery.

Production values must differ from Preview and Development under the Vercel isolation policy. Delivery reports `production-secret-reused` without printing the provider response. Reshoot uses the separate `reshoot-production-build` Sentry organization token with `org:ci` scope for source-map uploads and releases; keep its source in the Production vault. Rotate the source token rather than weakening isolation or editing Preview.

Production delivery classifies public settings through the pinned `configNames` list; all other allowlisted values remain write-only Secrets. Vercel’s Require Separate Values policy stays enabled: real Production secrets must differ from non-production values. Existing variables are updated by their exact Production IDs. A legacy Secret explicitly listed as public configuration is replaced only in Production because Vercel cannot convert it to Config in place; Preview and Development rows are preserved. Provider responses and credential values are never logged. A failed sync holds deployment; rerun delivery after fixing the named key at its source.

A READY build is not a completed release until Vercel confirms Production domain
assignment. Required integration checks, including Clerk DNS verification,
remain enforced. The workflow waits for assignment, fails on alias errors or
timeout, and rechecks the current main commit before reporting `Production
READY`. Never bypass a failed integration check to make delivery green.

## Staging a prebuilt deployment

Use **Actions → Production delivery → Run workflow → main** with **stage_prebuilt** selected to build and verify a Vercel deployment while production domains keep serving the live release. Leave the option clear for a production delivery.

Infisical Production owns the Sentry upload token. The build job uses the encrypted `SENTRY_AUTH_TOKEN` copy in the GitHub Production environment and confirms the source-map upload before deployment. Refresh that copy after rotating the source token, then rerun delivery.

The GitHub Production variable `VERCEL_PUBLIC_BUILD_OVERRIDES` holds the explicitly public build values whose Vercel rows are non-readable. Update the public copies when changing those frontend settings.

The prebuilt job checks the native Clerk secret binding in Vercel by metadata before compiling with the public key. Vercel supplies the secret to runtime requests.
