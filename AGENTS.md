# Repository Instructions

Preserve Reshoot’s product-photography workspace, generation/credit accounting, and private storage boundaries. Work on the current branch and retain package-age and dependency-source protection.

## Product rotation artwork

Use [$reshoot_generate-rotation-images](.codex/skills/reshoot_generate-rotation-images/SKILL.md) when creating or replacing product-angle sample photographs. Generate final photographic artwork from the authoritative original; textureless mesh captures are orientation hints only. Do not publish direct proxy-mesh renders as final photos. Review source fidelity, dimensions, orientation, fixed-camera/light targets and desktop/phone playback separately from numeric center/base registration; a consistent hint mesh does not certify final AI geometry. After authorized deployment, verify all product rotations in the actual live carousel on desktop and phone against the exact READY production commit; HTTP/framing checks alone do not complete visual verification.

## Secrets

Use the human Infisical CLI login and pinned development project in `.infisical.json`. Default dev fetches the application allowlist into memory; never log credentials or create plaintext exports. Production is isolated in `reshoot-production`, Production `/`, synced only to this Vercel project’s Production environment. Redeploy after changes, retain Preview settings, and keep Keychain originals until verification/rotation is complete. Do not invoke reconciliation, retention cleanup, database migrations, credit minting, or paid image generation merely to test secret access. Run `pnpm test:secrets` and normal lint/type/app checks after changing this path.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
