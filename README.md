<div align="center">
  <img src="./public/brand/web-seo/og-image-1200x630-ctr.png" alt="Reshoot turns one product photo into a consistent set of studio angles" width="640" />

  **📸 Every angle, one product. 📸**
</div>

Reshoot is a persistent product-photography workspace for small brands, studios, and product teams. Create a project for each product, upload every original photo you have, choose the views you need, and keep every generated version and approval together.

One selected original remains the primary identity anchor. Up to four additional originals can support each generation, and Reshoot shows the exact credit quote before a batch begins.

## Install

Requirements: Node.js 24+, pnpm 10, and an authenticated Vercel CLI.

```bash
git clone https://github.com/tsilva/reshoot.git
cd reshoot
pnpm install
vercel link
keyenv doctor
vercel env run -e development -- keyenv run -- pnpm dev
```

Private local values declared in `.keyenv.toml` live in macOS Keychain. Vercel
development values are injected without writing a plaintext `.env.local` file;
Node continues to read both sources normally from `process.env`. The development
server prints the local URL. The seeded demo user is always signed in.

## Commands

```bash
pnpm dev        # start the local development server
pnpm build      # create a production build
pnpm start      # serve the production build
pnpm lint       # run ESLint
pnpm typecheck  # check TypeScript
pnpm test       # run unit and integration tests
pnpm db:migrate # apply forward database migrations
```

## Notes

- Neon stores users, projects, immutable generation history, pricing, and credit accounting.
- A private Cloudflare R2 bucket stores originals, normalized references, previews, and generated outputs. Browser uploads use short-lived signed URLs.
- Vercel Workflow runs durable generation jobs. Jobs continue when a browser closes and are protected against duplicate paid attempts.
- Uploads accept up to 25 JPG, PNG, or WebP originals per project, 20 MB each and 500 MB total.
- Credits are purchase value at 100 credits per $1. Local and preview deployments include a clearly labeled no-charge test checkout. Production credit minting is disabled until real billing exists.
- The image service and model are private server configuration and are intentionally absent from public APIs, browser bundles, filenames, and customer-facing diagnostics.
- A previous browser-saved shoot is imported once into the persistent project library, then the legacy browser database is retired.
- The deployment target is the Vercel project `tsilvas-projects/reshoot` at `reshoot.tsilva.eu`.
- The preserved Stitch export and visual verification notes are in [`design/stitch-source`](./design/stitch-source) and [`design-qa.md`](./design-qa.md).

## License

No license file is currently included.
