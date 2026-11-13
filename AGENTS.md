# Repository Instructions

Preserve Reshoot’s product-photography workspace, generation/credit accounting, and private storage boundaries. Work on the current branch and retain package-age and dependency-source protection.

## Releases

Use [$reshoot_build-release](.codex/skills/reshoot_build-release/SKILL.md) when
building, publishing, monitoring, or verifying a Reshoot release. It adapts the
shared release workflow to this repository's existing GitHub Actions and Vercel
delivery contract, including exact-commit READY and Production domain verification.

## Product rotation artwork

Use [$reshoot_generate-rotation-images](.codex/skills/reshoot_generate-rotation-images/SKILL.md) when creating or replacing product-angle sample photographs. Generate final photographic artwork from the authoritative original; textureless mesh captures are orientation hints only. Do not publish direct proxy-mesh renders as final photos. Review source fidelity, dimensions, orientation, fixed-camera/light targets and desktop/phone playback separately from numeric center/base registration; a consistent hint mesh does not certify final AI geometry. After authorized deployment, verify all product rotations in the actual live carousel on desktop and phone against the exact READY production commit; HTTP/framing checks alone do not complete visual verification.

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


## Service access

Normal commands use the configured server environment. Keep credentials server-only and out of logs, browser bundles and committed files. Preserve separate Production delivery and all transport permission checks. Read-only migration audits must inspect only permissions and the migration ledger; never apply migrations or read application rows. Provisioning requires explicit administrative review before credential reads or infrastructure changes.

Native Clerk/Vercel integration owns the Production and Preview Clerk keys; do not overwrite them through secret delivery. Preserve test-only Stripe checkout and verified webhook allowance grants: the return page is read-only and the user submits Checkout. Verification must not mint credits, run reconciliation or retention cleanup, apply database migrations, or generate paid images.
