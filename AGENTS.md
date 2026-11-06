# Repository Instructions

Preserve Reshoot’s product-photography workspace, generation/credit accounting, and private storage boundaries. Work on the current branch and retain package-age and dependency-source protection.

## Releases

Use [$reshoot_build-release](.codex/skills/reshoot_build-release/SKILL.md) when
building, publishing, monitoring, or verifying a Reshoot release. It adapts the
shared release workflow to this repository's existing GitHub Actions and Vercel
delivery contract, including exact-commit READY and Production domain verification.

## Product rotation artwork

Use [$reshoot_generate-rotation-images](.codex/skills/reshoot_generate-rotation-images/SKILL.md) when creating or replacing product-angle sample photographs. Generate final photographic artwork from the authoritative original; textureless mesh captures are orientation hints only. Do not publish direct proxy-mesh renders as final photos. Review source fidelity, dimensions, orientation, fixed-camera/light targets and desktop/phone playback separately from numeric center/base registration; a consistent hint mesh does not certify final AI geometry. After authorized deployment, verify all product rotations in the actual live carousel on desktop and phone against the exact READY production commit; HTTP/framing checks alone do not complete visual verification.

## Secrets

Use the human Infisical CLI login and pinned development project in `.infisical.json`. Default dev fetches the application allowlist into memory; never log credentials or create plaintext exports. Production is isolated in `reshoot-production`, Production `/`, synced only to this Vercel project’s Production environment. Redeploy after changes, retain Preview settings, and keep Keychain originals until verification/rotation is complete. Do not invoke reconciliation, retention cleanup, database migrations, credit minting, or paid image generation merely to test secret access. Run `pnpm test:secrets` and normal lint/type/app checks after changing this path.

Clerk API keys are an explicitly approved exception: the native Clerk/Vercel
integration owns `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
for Production and Preview. Do not mirror or overwrite these keys through
Infisical delivery. All other application secrets retain their existing source
and isolation policy. `RESHOOT_PAYMENTS_MODE` is public configuration from the
Production vault; `stripe_test` enables monthly Stripe sandbox subscriptions only. Legacy
`simulated` and other values disable checkout. Never enable real charges.

Stripe test checkout requires environment-specific `STRIPE_TEST_SECRET_KEY` and
`STRIPE_TEST_WEBHOOK_SECRET` in the matching vault and reviewed hosted delivery
allowlist. The reviewed trusted delivery pin supplies these names only to Production.
Local agent access needs a separately reviewed sandboxed API route and incoming
webhook-signature secret flow; do not add these names to the legacy injection
launcher or fetch them directly. Source/fixture checks use synthetic credentials.
Only verified paid monthly invoices may grant allowances, through the webhook; the
return page is read-only. The retired simulator must not grant credits. The user
must submit any external test Checkout themselves. See the Stripe test checkout
section in `docs/production-delivery.md` for activation prerequisites.

For Neon migration inspection, run `pnpm db:check-migrations`. The reviewed
service mapping is Agent Vault bundle `local-reshoot-migration-audit`, service
`reshoot-neon-ledger`, for `reshoot-neon` → `main` → `neondb`, using
`reshoot_migration_auditor`. The owner-only local profile is
`~/.config/infisical/neon-migration-checks/reshoot.json`. This is a dedicated
Agent Vault binding; `.infisical.json` continues to identify the existing
Development source project. Do not use its application `DATABASE_URL` for this
check. Missing profiles or failed authentication must stop without fallback.

The check starts a short Agent Vault session with its instance and CA pinned,
requires the expected DSN placeholder, and runs curl in the macOS sandbox.
That sandbox permits network access only to the local proxy and blocks home
directory reads except the public proxy CA. The proxy supplies the connection
string to `POST /sql` on the reviewed endpoint. The fixed query reads permission
metadata and the migration ledger, then compares timestamps and hashes against
this checkout. It must not run migrations, read application rows, or change
application launcher defaults. Follow the provisioning instructions in the README
when moving the check to another trusted Mac; never retrieve the connection
string into an agent process.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Internal reports

Keep session QA reports in `.internal/qa/YYYY-MM-DD-<topic>.md`, reusable private
notes in `.internal/reference/`, and browser captures/measurements in
`.internal/evidence/`, all beneath the Git root. Verify `/.internal/` is ignored
and contains no tracked files before writing. Public testing/development docs
retain reproducible checks and known limitations; do not link them to private
reports or add machine paths and operator/session details.

<!-- agent-vault-agentbridge:read:start -->
## Read-only AgentBridge check

For local agent-operated model-catalog checks, use `pnpm agentbridge:check`.
The reviewed mapping is Agent Vault bundle `local-reshoot-agentbridge-read`,
service `reshoot-agentbridge-models`, for GET `/api/v1/models` on
`127.0.0.1:8082`. The owner-only local metadata profile is
`~/.config/infisical/agentbridge-clients/reshoot-read.json`.

The profile validates this repository's native Development source identity and
pins the existing routing helper's digest. No application key or Sentry token
is fetched. The local gateway accepts public placeholders; AgentBridge's own
upstream credential route remains responsible for provider authentication.
The sandboxed Node client imports the reviewed app routing helper, requires
`agentbridge_public_placeholder`, and enables proxy support explicitly.
Its fixed request returns only catalog size and whether the configured default
is advertised. A missing catalog entry is informational; a catalog does not
prove that an inference request will succeed or that upstream login is valid.

Outbound access is limited to the local proxy. Home reads are limited to the
reviewed runtime, public CA and required client/config files. Only the pinned
Node runtime can be executed inside the sandbox; Keychain service lookup is
blocked. The trusted launcher and other full-access host processes remain
outside that isolation boundary. The instance and CA are pinned without
changing system trust, and sessions last at most ten minutes.

This profile permits only read-only catalog access. It does not migrate or
launch the full application, authorize inference, or enable chat, image,
embedding, file or MCP transports. Missing/changed bindings and failed checks
stop without raw-key or direct-network fallback. Existing app defaults,
production delivery, Sentry settings/uploads and other service profiles remain
unchanged. Run `pnpm test:agentbridge` after modifying this client or profile.
<!-- agent-vault-agentbridge:read:end -->


## Agent Vault image-comparison tool

For local image-model comparisons, use the opt-in commands:

```sh
pnpm agentbridge:tools:check
mkdir -p .internal/agent-vault/comparisons/my-run
pnpm agentbridge:compare:vault --phase baseline --model openai/gpt-image-2.6-sunburst --output-dir "$PWD/.internal/agent-vault/comparisons/my-run"
```

The check makes only catalog and upstream-authentication requests. The comparison
command runs the existing comparison client and **makes real image requests**;
run it only after reviewing and approving the complete prompts, reference images
and number of requests. Only 2.6 Sunburst is supported. Baseline sends two requests; candidate
sends three. Omitting `--model` selects 2.6 Sunburst. Changed comparison source
requires trusted review of the protected profile pins before use. This
migration was verified with synthetic responses, without real image generation.

Service mapping: native Development project `cdb4be1b-c53c-4b18-87eb-6f90aae2b661`,
reserved service folder `/agents/agentbridge`, Agent Vault bundle
`local-reshoot-agentbridge-tools`. The gateway service allows catalog, chat and
image paths on `127.0.0.1:8082`; its separate authentication service permits only
GET `/api/v1/openrouter/key` using the `localhost:8082` alias. No application key
is copied into this folder: the gateway owns upstream authentication. The
owner-only `agentbridge-clients/reshoot-tools.json` profile under the Infisical
configuration directory pins the native identity, runtime, helpers, comparison
source, routing helper and dependency lock. Source changes require trusted review.

The sandbox restricts network access to the proxy, with public placeholders and
process-local CA trust. Only the selected canonical output directory under
`.internal/agent-vault/comparisons` is writable. Credential files and Keychain
access are blocked; provider failure details are withheld and a failed transport
stops subsequent dispatch. Recorded requests are never automatically replayed.
This protects the sandboxed client, not other full-access same-user host processes.

For the opt-in local webpage's database route, use the isolated local app setup
below. It preserves interactive transactions through a trusted local relay;
the normal Neon transport remains unchanged. The comparison tool still does not
provide Clerk, storage or signing credentials. Never reuse the read-only
migration-auditor role for application writes or bypass provider cost recording.

The original catalog check, default app launchers, model choices, production
delivery and Sentry configuration remain unchanged. Run `pnpm test:agentbridge`
and the provider/naming tests after changes to these helpers.


## Isolated local app through Agent Vault

For agent-operated local app work needing database and AgentBridge access, use
`pnpm dev:vault`; use `pnpm db:check-local:vault` for the read-only check.
The reviewed mapping is native project `cdb4be1b-c53c-4b18-87eb-6f90aae2b661`,
Development, reserved folder `/agents/database`, bundle `local-reshoot-development`.
Agent Vault manages this credential directly; never export the folder or inject
a database URL. The app receives `reshoot_database_public_placeholder` and uses
only the separate `reshoot_agent_vault_dev` database as `reshoot_agent_vault_app`.
The owner-only `database-relay/reshoot/app.json` profile in the Infisical config
directory pins source, runtime, compiler, native binding, CA and relay policy.
Changed bindings must fail; source approval is explicit trusted administration.
Follow [local development through Agent Vault](docs/local-agent-vault.md) for
installation, fake-first tests, service paths, lifecycle and limitations.
Keep normal launch defaults, production delivery and Sentry unchanged. Sign-in,
storage, signing and Realtime still need separate compatible routes; do not add
an auth bypass, dummy storage keys, raw-key fallback or paid inference to test it.
