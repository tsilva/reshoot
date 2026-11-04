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
Production vault; `simulated` enables no-charge top-ups, never real charges.

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
