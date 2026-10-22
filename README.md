<p align="center">
  <img src="./public/brand/web-seo/og-image-1200x630-ctr.png" alt="Reshoot turns one product photo into a consistent set of studio angles" width="640" />
  <br />
  <!-- repo-tagline:start -->
  <strong>📸 Every angle, one product 📸</strong>
  <!-- repo-tagline:end -->
</p>

Reshoot is a single-page product-photography studio for small brands, studios, and product teams. Explore a free, pre-made sample on the home page, upload your own product, choose the views you need, and keep every generated version and approval together. Opening a saved or newly uploaded shoot replaces the sample canvas, and the wallet expands on the same page for balances, credit activity, and supported test top-ups.

The sample requires no session and uses no credits. Starting your own shoot or opening a wallet creates or resumes the private browser workspace. Older welcome, project, and account links return to the home studio; a selected shoot remains addressable through `/?project=<id>#studio`. Real billing remains disabled, and no-charge test top-ups remain limited to local and Preview environments.

The visual design takes inspiration from [Mudora by RylicStudio](https://dribbble.com/shots/26596729-Mudora-Pottery-and-Ceramics-Landing-Page): parchment surfaces, clay and olive accents, thin editorial rules, and circular actions. Instrument Serif and Caveat provide the display and handwritten styles, with Hanken Grotesk for controls. The interactive sample, inline wallet, and saved shoots share this design.

One selected original remains the primary identity anchor. Up to four additional originals can support each generation, and Reshoot shows the exact credit quote before a batch begins.

## Install

```bash
git clone https://github.com/tsilva/reshoot.git
cd reshoot
pnpm install
pnpm secrets:check
pnpm dev --port auto
```

For browser uploads and ZIP exports, the private R2 bucket's CORS policy must allow the server's printed origin, including its automatically assigned port, with `GET`, `PUT`, `HEAD`, and the `Content-Type` header. Configure this with a bucket administrator using [Cloudflare's CORS guide](https://developers.cloudflare.com/r2/buckets/cors/); application credentials only have object access. Signed URLs still control access to private files.

Development and Vercel Preview use the private `reshoot-development` bucket and
the Development database. Production keeps the private `reshoot` bucket and its
Production database. Each bucket has its own Object Read & Write token, with no
access to the other bucket. Fetch local credentials from the pinned Development
Infisical project; never copy Production credentials into local or Preview
configuration. See [R2 environment isolation](docs/production-delivery.md#r2-environments)
for the source vaults, rotation procedure, and rollback boundary.

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

Sentry 11 uses the `@sentry/nextjs/config` build entry point and enables logs by default. Client and server integrations retain their configured log levels and explicitly disable personal, request, queue, and content data collection.
Dependency regression tests accept newer patched versions within reviewed release branches, reject vulnerable downgrades and unknown branches, and audit the complete locked graph.

- Neon stores users, projects, immutable generation history, pricing, and credit accounting.
- A private Cloudflare R2 bucket stores originals, normalized references, previews, and generated outputs. Browser uploads use short-lived signed URLs.
- Scheduled reconciliation is disabled. Users request another attempt with Regenerate after a failed generation; automatic pricing reconciliation and expired-object cleanup are also paused.
- Dependency overrides exclude Workflow's unused NestJS adapter and use tinyglobby for Next.js lint root discovery, removing two unpatched dependency chains while retaining Next.js Workflow support and lint rules.
- Uploads accept up to 25 JPG, PNG, or WebP originals per project, 20 MB each and 500 MB total.
- Testing workspaces start with 1,000 fake credits without payment. Local and preview deployments also include a clearly labeled no-charge test checkout. Production checkout remains disabled until real billing exists. Fake credits still authorize real image-service requests; generation consumes provider resources.
- The image service and model are private server configuration and are intentionally absent from public APIs, browser bundles, filenames, and customer-facing diagnostics.
- A previous browser-saved shoot is imported once into the persistent project library, then the legacy browser database is retired.
- The deployment target is the Vercel project `tsilvas-projects/reshoot` at `reshoot.tsilva.eu`.
- The preserved Stitch export and visual verification notes are in [`design/stitch-source`](./design/stitch-source) and [`design-qa.md`](./design-qa.md).

## Image generation evaluation

The current catalog-photo prompt defines camera movement, preserves product packaging and markings, and keeps lighting and framing consistent across views. Flare is the selected default; Sunburst remains a server-configured alternative. See the [model comparison and reproduction procedure](./docs/image-generation-evaluation.md). Hidden surfaces are estimates unless supporting originals show them.

## License

No license file is currently included.


## Model routing

Development uses AgentBridge (`AGENTBRIDGE_BASE_URL`, default
`http://127.0.0.1:8082/api/v1`, and optional `AGENTBRIDGE_API_KEY`).
Production and Preview call OpenRouter directly using their own server-only
`OPENROUTER_API_KEY`; a missing production key disables model requests.
Production credentials come from this app’s isolated Infisical project.
The shared text-routing default is `deepseek/deepseek-v4.1-flash-1017`.
Image generation keeps the supported image models.

Production secrets are delivered through GitHub Actions. Infisical production secret changes automatically trigger sync and deployment; see [production delivery](docs/production-delivery.md) for scope and recovery.

Production delivery keeps Vercel secret isolation enabled and distinguishes public configuration from private credentials; see [production delivery](docs/production-delivery.md).
