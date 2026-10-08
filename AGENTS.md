# Repository Instructions

Preserve Reshoot’s product-photography workspace, generation/credit accounting, and private storage boundaries. Work on the current branch and retain package-age and dependency-source protection.

## Secrets

Use the human Infisical CLI login and pinned development project in `.infisical.json`. Default dev fetches the application allowlist into memory; never log credentials or create plaintext exports. Production is isolated in `reshoot-production`, Production `/`, synced only to this Vercel project’s Production environment. Redeploy after changes, retain Preview settings, and keep Keychain originals until verification/rotation is complete. Do not invoke reconciliation, retention cleanup, database migrations, credit minting, or paid image generation merely to test secret access. Run `pnpm test:secrets` and normal lint/type/app checks after changing this path.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
