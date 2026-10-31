<p align="center">
  <img src="./public/brand/web-seo/og-image-1200x630-ctr.png" alt="Reshoot turns one product photo into a consistent set of studio angles" width="640" />
  <br />
  <!-- repo-tagline:start -->
  <strong>📸 Every angle, one product 📸</strong>
  <!-- repo-tagline:end -->
</p>

Reshoot is a single-page product-photography studio for small brands, studios, and product teams. Explore free, pre-made samples on the home page, upload your own product, choose the views you need, and keep every generated version and approval together. Opening a saved or newly uploaded shoot replaces the sample canvas, and the wallet expands on the same page for balances, credit activity, and supported test top-ups.

Start a shoot by selecting at least one product photo; no name is required. Reshoot suggests a short name from the first saved photo’s visible content. On touch devices whose browser supports native capture, **Take a photo** opens the rear-facing camera; choosing existing photos remains available. Both inputs use the same JPG/PNG/WebP validation, upload limits, progress, and retry flow. Camera availability and the native chooser depend on the device/browser. If automatic naming is unavailable, photos are still saved under **Product shoot**. Later uploads preserve the shoot’s existing name.

On mobile, upload and checkout dialogs fill the available screen, including short phone landscape layouts. The upload dialog keeps its header and actions visible while the photo list scrolls independently. Safe-area padding keeps controls clear of screen cutouts and the home indicator; the page behind the dialog stays still. Desktop dialogs remain centered.

The home page introduces AI product photography with “Your photos. Professional 360° views.” Its primary action, “Create professional 360° views,” opens the photo-upload dialog. The supporting copy explains that everyday product photos become clean studio views, with distracting backgrounds removed. The cleaned product stays dominant, with a small unframed original-photo thumbnail and a quiet “Show original” link at the lower right of the control row. Previous, play/pause, and next sit centered beneath the photograph, aligned with the original thumbnail. The generated medallion and product-selector row are removed.

The desktop hero sizes its product preview and headline to the viewport height so the introduction, upload action, playback controls, and original preview fit above the fold at standard desktop sizes. Smaller screens retain a stacked layout with natural scrolling.

The samples require no session and use no credits. On page load, the linen doll starts on its cleaned front view. Eight studio angles advance every 0.9 seconds; after the last angle, the slideshow switches to the next product’s front view, cycling through Linen doll, Ceramic mug, and Leather handbag. The original is never inserted into this automatic sequence. All twenty-four studio photographs preload and stay mounted. Previous/next and keyboard arrows move through the same sequence, including across product boundaries, and pause playback until Play is selected.

The original thumbnail stays small and unframed. On a pointer device, hovering it smoothly enlarges the photo upward from its bottom-right corner without shifting the page; keyboard focus offers the same preview, and reduced-motion preferences remove the animation. Clicking “Show original” pauses the slideshow and opens the full original photograph in the existing accessible dialog. The dialog identifies it as an illustrative example, traps focus, and closes through its close button or Escape. Closing returns focus to the thumbnail and restores the previous angle and playback setting. Touch users can open the dialog directly. No product-selector footer is shown.

Playback starts after the current product’s studio photos load, including while the mouse rests over the preview. Keyboard focus on a carousel control pauses it, as do an offscreen sample or hidden page. The pause/play control stops or resumes the loop immediately, including while keyboard focus remains on the button; a later keyboard focus can pause it again. Reduced-motion preferences disable automatic playback by default, with Play available as an explicit opt-in. Automatic changes do not announce every frame to screen readers; manual navigation still announces the product, photo and position.

Starting your own shoot or opening a wallet creates or resumes the private browser workspace. Older welcome, project, and account links return to the home studio; a selected shoot remains addressable through `/?project=<id>#studio`. Real billing remains disabled, and no-charge test top-ups remain limited to local and Preview environments.

The carousel’s accessible description identifies these as illustrative examples. Its everyday uploads were created from earlier product artwork, then edited to add cluttered household backgrounds, uneven indoor lighting, slight overall softness, and natural handheld framing. All three sample products’ photographs are generated from their displayed original as the authority for identity, materials and photographic detail, plus a textureless mesh capture used only to clarify orientation and occlusion. Final artwork comes from native image generation; rendered meshes and proxy textures are not published as product photographs. Hidden surfaces remain estimates, and these examples are not recorded customer uploads or measured results of the paid application pipeline. See [example upload provenance](design/qa/example-uploads/generation.json), the [current rotation record](design/qa/original-rotation/generation.json), and [original/guide input roles and exact prompts](design/qa/orientation-guided-rotation/photographs.json).

Each rotation cycles through front, front-right three-quarter, right profile, back-right three-quarter, back, back-left three-quarter, left profile, and front-left three-quarter. The doll turns as a whole, the mug’s handle passes behind and then in front of its body, and the handbag includes narrow side profiles and a plain rear panel. Hidden surfaces are conservative estimates from the single original. Lighting stays above camera-left, with soft shadows extending to screen right. Views switch at full opacity without a fade-in animation.

New generation requests ask for the product to turn around its own center vertical axis while the camera and studio lights stay fixed. They explicitly lock the camera’s position, distance, elevation, focal length and framing; all standard angle presets use the same level camera elevation. For shots with a defined angle, the app appends a server-rendered, textureless generic cup image at that exact azimuth/elevation as an orientation-only cue. The selected originals remain the only authority for the user's product identity, shape, materials and photographic detail; the prompt explicitly forbids copying the cup, handle, gray material or dimensions. This is a temporary generic cue, with product-specific mesh support deferred. These are generation targets, not a guarantee of rigid 3D reconstruction. Existing saved results are unchanged.

To create or replace sample artwork from an original photo, use the repository’s [$reshoot_generate-rotation-images](.codex/skills/reshoot_generate-rotation-images/SKILL.md) skill. It generates photographic outputs from the authoritative original with textureless mesh views as orientation hints, and separately reviews source fidelity, rotation coherence and registration. After authorized deployment, it verifies every view, playback and product transition in the actual live carousel on desktop and phone against the exact READY production commit, retaining visual evidence. A fixed proxy rig proves the hints are consistent; it does not prove the final AI photographs share rigid geometry. The earlier handbag dimension drift is preserved in the historical QA record; the current bag was regenerated with the same original-plus-guide method.

Uniform display scaling and translation register each sample product’s body axis at the exact horizontal center and hold its base steady across its eight views, without cropping, stretching or retouching the generated artwork. Registration measures the doll’s torso, the mug’s base below its handle, and the handbag’s full body below its handles, rather than a moving side-panel seam. A measured envelope leaves at least 10% product margin on every edge; narrower profiles retain more white space. The soft shadow is excluded from the product silhouette. Registration values scale with the viewer on smaller screens. [Measured framing](design/qa/original-rotation/framing.json) records the bounds, and `pnpm test` verifies all 24 published images against their source hashes, display margins, centered axes and consistent floor contact.

The visual design retains the editorial typography, clay and olive accents, and fine rules inspired by [Mudora by RylicStudio](https://dribbble.com/shots/26596729-Mudora-Pottery-and-Ceramics-Landing-Page), on a white studio surface. Instrument Serif supplies the headlines and Hanken Grotesk the controls. The sample uses a single photo carousel; repeated marketing sections and the oversized empty-library illustration are removed. The inline wallet, upload dialog, and saved shoots share the white design.

One selected original remains the primary identity anchor. Up to four additional originals can support each generation, and Reshoot shows the exact credit quote before a batch begins. The internal orientation cue is appended after those originals; it is not a selectable original or an extra customer reference in the quote. The normal single generation request records its actual provider usage as before.

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
The CI baseline includes Next.js 16.4.2, Vitest 4.1.12, Vite 8.2.4 and Zod 4.6.7; the seven-day package-age rule and vulnerability audit remain enabled. Failed CI holds Production delivery before credential sync or deployment.

The approved October 31, 2026 security exception pins `minimatch` 11.0.1, `glob` 14.0.2, `@isaacs/nonrecursive-glob-match` 1.0.1 and `path-scurry` 3.0.0. pnpm 10.17 needs name-based age exclusions, so exact overrides restrict those exclusions to the approved releases. A small CommonJS export patch routes legacy callable `minimatch` imports and modern named imports to the same patched matcher. Regression checks cover ordinary matching, bounded globstar preprocessing and cancellation before/during directory traversal; the complete dependency audit remains enforced.

- Neon stores users, projects, immutable generation history, pricing, and credit accounting.
- Active generation batches use Neon Realtime instead of the previous two-second status poll. The private subscription carries only a batch revision; changes coalesce into a status read, and outputs are limited to that batch. Connections pause in hidden tabs and close when the batch finishes. Reconnect resumes a saved batch without creating another credit hold.
- A private Cloudflare R2 bucket stores originals, normalized references, previews, and generated outputs. Browser uploads use short-lived signed URLs.
- Scheduled reconciliation is disabled. Users request another attempt with Regenerate after a failed generation; automatic pricing reconciliation and expired-object cleanup are also paused.
- Each active batch has a durable workflow for outbox dispatch retries and stalled-attempt credit release, independent of an open browser. It sleeps until dispatch/lease deadlines; it never automatically repeats a paid image request. Status GETs and subscription renewals have no generation side effects.
- Dependency overrides exclude Workflow's unused NestJS adapter and use tinyglobby for Next.js lint root discovery, removing two unpatched dependency chains while retaining Next.js Workflow support and lint rules.
- Uploads accept up to 25 JPG, PNG, or WebP originals per project, 20 MB each and 500 MB total.
- Testing workspaces start with 1,000 fake credits without payment. Local and preview deployments also include a clearly labeled no-charge test checkout. Production checkout remains disabled until real billing exists. Fake credits still authorize real image-service requests; generation consumes provider resources.
- The image service and model are private server configuration and are intentionally absent from public APIs, browser bundles, filenames, and customer-facing diagnostics.
- A previous browser-saved shoot is imported once into the persistent project library, then the legacy browser database is retired.
- The deployment target is the Vercel project `tsilvas-projects/reshoot` at `reshoot.tsilva.eu`.
- The preserved Stitch export and visual verification notes are in [`design/stitch-source`](./design/stitch-source) and [`design-qa.md`](./design-qa.md).

## Image generation evaluation

The current catalog-photo prompt defines camera movement and preserves product packaging and markings. Its shared studio instructions request a pure-white `#FFFFFF` background, a large diffused key light above camera-left at neutral 5500 K, and a central 80% placement box with at least 10% clear margin on each side. Rotation views retain one scale and body anchor; narrower profiles may have more white space. These are generation targets, not pixel-enforced output guarantees. Flare is the selected default; Sunburst remains a server-configured alternative. See the [model comparison and reproduction procedure](./docs/image-generation-evaluation.md). Hidden surfaces are estimates unless supporting originals show them.

## Model routing

Development uses AgentBridge (`AGENTBRIDGE_BASE_URL`, default
`http://127.0.0.1:8082/api/v1`, and optional `AGENTBRIDGE_API_KEY`).
Production and Preview call OpenRouter directly using their own server-only
`OPENROUTER_API_KEY`; a missing production key disables model requests.
Production credentials come from this app’s isolated Infisical project.
The shared text-routing default is `deepseek/deepseek-v4.1-flash-1017`.
Image generation keeps the supported image models.

Automatic shoot naming uses the vision-capable [`openai/gpt-4.1-mini`](https://openrouter.ai/openai/gpt-4.1-mini) through the same environment-specific provider routing. It sends only the first validated 640px preview inline, without filenames, owner details, EXIF metadata, or signed storage URLs. One naming attempt has an eight-second timeout and an 80-token output cap; it creates no image-generation jobs or credit holds. The title update is conditional on the original placeholder and primary photo, so a concurrent rename or primary-photo change wins.

Production secrets are delivered through the pinned shared GitHub Actions workflow. The standalone signed Infisical relay triggers synchronization and deployment; see [production delivery](docs/production-delivery.md) for scope and recovery.

Production delivery keeps Vercel secret isolation enabled and distinguishes public configuration from private credentials; see [production delivery](docs/production-delivery.md).

## Live generation updates

Apply `pnpm db:migrate` through the environment's existing credential workflow before running this version. Migration `0002_generation_realtime` adds an owner-scoped revision table and transactional triggers, including rows for existing batches. The Realtime beta cannot subscribe to the custom enum types in the generation tables, so the subscription reads only built-in UUID and bigint columns.

Enable Realtime on the matching Neon branch and keep `NEON_REALTIME_URL` and the server-only `NEON_REALTIME_SECRET` in that environment's Infisical vault. The local launcher injects both in memory. The server derives the database name from `DATABASE_URL` and seals a short-lived query using the authenticated workspace owner and requested batch; browsers cannot choose another owner or alter that query. Capabilities renew about every 50 seconds without loading generation history. Missing configuration displays a Reconnect action and does not restore interval polling.

Realtime reduces repeated unchanged result transfers; actual savings depend on batch activity and concurrent viewers. Neon still bills normal database compute and egress during its Realtime beta. A disconnected or backgrounded browser does not stop durable generation or credit settlement.

`pnpm test` covers subscription coalescing, renewal and authorization failure, durable dispatch/lease maintenance, and the guard against paying for an attempt that already ended. The opt-in `tests/batch-realtime-db.test.ts` contract test requires an explicitly disposable Neon branch; it creates database-only fixtures and never requests images or mints credits.

## License

[MIT License](LICENSE).
