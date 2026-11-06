# Testing

Run from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` includes provider-routing and sample-framing checks. The framing check
verifies all 24 published sample images against source/output hashes, transparent
pixels, guide roles/rigs, minimum margins, body-axis registration and floor contact.
The provenance manifests and guide assets under `design/qa/` are test inputs;
they remain tracked so these checks work in a fresh clone. These measurements do
not establish natural rotation, photographic quality or identical 3D geometry.

## Provider cost accounting

Rotation regression coverage is in `tests/rotation-review.test.ts`,
`tests/orientation-guide.test.ts`, `tests/generation-request.test.ts`,
`tests/generation-policy.test.ts` and `tests/generation-execution.test.ts`.
Synthetic responses verify opposite-side acceptance for all eight angles,
object-independent direction frames, symmetry handling, the new quote policy, rejection before storage or
credit capture, failed/malformed reviews without retries, and separate review
cost attribution. These fixtures test enforcement, not a real model's accuracy.
Before claiming photographic success, evaluate a fresh complete set against its
originals and inspect all transitions, both profiles and the wrap.

Apply `0006_rotation_review` before deploying the new acceptance path. Its ledger
uniqueness is per `(generation_attempt_id, purpose)`: one image and one review
can be recorded, but neither can repeat. Review spend must not overwrite the
legacy image-attempt amount. On a disposable local database, verify existing
image rows survive, both duplicate purposes fail, and reviews without an image
attempt and naming calls with an attempt are rejected. Never migrate a hosted
database or request paid generation solely to run these checks.

Run `pnpm exec vitest run tests/provider-cost.test.ts tests/provider-calls.test.ts tests/provider-cost-route.test.ts tests/generation-execution.test.ts tests/project-naming.test.ts tests/project-upload-naming.test.ts`
for credential-free provider-cost coverage. Fixtures verify pre-request ledger
creation, duplicate-call protection, valid zero versus missing/invalid usage,
paid HTTP errors and rejected/undecodable images, storage failures, timeouts,
both provider IDs, naming attribution, subtotal completeness, and bounded
read-only usage reconciliation. They also verify operator authorization even
in development, cache prevention, and that GET reporting never reconciles or
triggers inference. No test calls an external provider or needs real credentials.

Apply `0005_provider_cost_tracking` only through an authorized migration route
before deploying this code. On a disposable local PostgreSQL database, verify
historical positive costs are preserved, old zero/missing costs stay unresolved,
unstarted attempts are excluded, and the unique attempt and cost/source checks
reject invalid records. Source tests do not prove migration application or
complete provider usage for existing projects. Never run paid generation merely
to verify the ledger. Reporting and historical limitations are documented in
the README's Provider cost accounting section.

## Monthly subscription lifecycle

Run `pnpm exec vitest run tests/subscriptions.test.ts tests/accounting.test.ts` for credential-free allowance accounting checks. They cover duplicate/concurrent invoices, renewal expiry, failed payment without a grant, cancellation through the paid period, delayed invoices/events, customer isolation, retained legacy balances, in-flight holds and late refunds. Run the full suite for existing generation and authentication boundaries.

Use a synthetic visual fixture for desktop and phone panel checks when application credentials are unavailable. Test empty, active, payment-attention and ending-plan states; inspect the Best value/Most usage hierarchy, monthly amounts, expiry terms, focus, disabled states and responsive overflow. Fixture checks do not certify Clerk's hosted panel, database migration or Stripe delivery.

For a user-operated sandbox run, verify initial and renewal `invoice.paid` delivery, idempotent replay, failed renewal without allowance, period-end cancellation, customer portal isolation and the return page's pending/confirmed states. Never submit a Checkout payment or change billing settings through agent tools. Setup requirements are in [production delivery](production-delivery.md#stripe-test-checkout).

## Accounts and Stripe test checkout

Open `/privacy` and `/terms` without an account. Verify each page's title,
canonical URL, revision date, contact link, section navigation and links to the
other policy and home page. Check both policies and the home-page footer at
desktop and phone widths for readable text and no horizontal overflow. The
home and authentication pages must expose both policy links. Confirm that
`/sitemap.xml` includes their canonical URLs. Policy review and deployment are
separate from Google's OAuth branding verification and publishing status.

`pnpm typecheck` regenerates current Next.js route declarations before TypeScript.
Generated declarations belonging to previous development servers are excluded;
no running server needs to be stopped when a route changes.

The account tests verify that a legacy demo cookie cannot authenticate a user,
Clerk IDs isolate account lookups, and racing first requests create only one empty
wallet. Stripe tests use synthetic fixtures and never connect to Stripe, Clerk,
Neon or image providers. They cover same-origin/authentication boundaries,
server-side pricing, test-only configuration, live-session rejection, genuine SDK
signature verification, altered/stale signatures, amount/owner/line-item
mismatches, unpaid sessions, delayed success, idempotency, concurrent delivery,
held-credit preservation and account isolation. The old simulator route must
return 410 without granting credits.

Verify that Manage account contains Plan & usage, and that the header balance shortcut,
studio View plans and existing `/account` and `?wallet=open` links open that tab.
Primary buttons and the Best value badge must retain readable light-on-olive
colors outside the studio DOM. Test desktop and narrow-phone layouts, including
pending, delayed, error, failed, expired, cancelled and completed checkout states.
Return content stays within 480px, without a nested modal frame or horizontal
scrolling. Back to plans/Done restores focus to the Plan & usage heading.

Use synthetic status responses for browser layout and polling checks. Check again
must restart bounded polling, unmount must stop it, and a forged success URL must
never grant credits. A completed receipt refreshes the header balance, activity
and studio quote. Checkout unavailable must leave plan actions disabled.

External verification requires the reviewed Stripe credential and webhook routes
in [Production delivery](production-delivery.md#stripe-test-checkout). The user
completes test Checkout directly; agent verification must not submit a payment or
change payment methods. Read the resulting session and webhook delivery, then
confirm exactly one ledger grant and the updated account balance. Check cancel,
decline, delayed fulfillment and duplicate delivery with isolated fixtures.
Full account isolation also requires two separate Clerk accounts. Passing source
or fixture tests does not establish external configuration or delivery.

## Studio and gallery checks

Use synthetic/local fixtures for generation, credits and storage behavior. Browser
verification alone does not authorize a paid request, credit minting, migration
or changes to production data. Follow the repository's configured development
launcher and reuse existing servers.

At desktop and narrow phone sizes, verify that **Add photos** opens an empty
shoot workspace without an upload dialog. Test file selection and page-wide
file drops, additional photos, invalid file types, upload limits, progress,
partial failures and retrying only failed files. Before any reference is saved, the empty upload area must fill the available
height below the header, with no lower Add photos or Generate controls. Verify
that those controls appear after the first saved reference, disappear after the
last is removed, and show the quoted credits in smaller text below Generate inside the button, without a view count or explanatory label. Select each thumbnail with mouse and keyboard to verify that the large preview changes without changing the quoted cost. Check the top-left remove control and preview fallback after removing the selected reference. Check that adding and removing saved photos refreshes the quoted cost, including removing the primary, removing the last reference and crossing the five-reference cap. The drag target must contain no price. Removal must check ownership, serialize with generation confirmation and reject generated shoots. A removed photo must not be restored by replaying upload finalization.
Verify that busy or completed shoots reject drops without navigating to the file.
Extract the ZIP and verify its `reshoot_<hyphenated-project-name>_<short-project-id>.zip`
name, matching top-level folder, perspective-only filenames and original image
formats. Include older cached shoots, registered phone views and repeated labels.
With mocked storage, verify project deletion removes current and legacy ZIPs
before success, storage failures allow retry, unowned projects cannot delete
objects, and an export finishing after deletion cannot publish another ZIP.
Retention cleanup must remove leftover ZIPs even without generated image records.
Check keyboard access, focus, image loading, persistent controls and console
errors. Verify pause/play, previous/next wrapping, arrows, product boundaries,
menu/dialog pause, image-readiness waits and reduced-motion opt-in. A single-view
shoot must not expose ineffective navigation. Completed-gallery autoplay must
follow the same rightward sequence as Rotate right, including the first-to-last
wrap; Rotate left must step in the opposite direction.

Open a shoot from a lower library row, then return with the shoot's back arrow,
Reshoot home link and browser Back. Each route should show the visited project
card below the sticky header at desktop and phone widths, including after the
project order changes. Browser Forward should reopen the shoot at the top.
Check a directly opened shoot and a newly created shoot too. A library return
target that no longer exists should fall back to the library heading.

Check generating library cards at zero, partial and completed batch progress.
The bar must follow actual settled jobs, including failures, and remain
indeterminate if progress is unavailable. Verify live completion refreshes the
card without starting or resuming generation.

For any object, compare all eight views against the originals and the common
physical coordinate frame. Opposite profiles must expose opposite sides, with
asymmetric landmarks remaining attached to their original physical surfaces.
Check near/far occlusion, component attachments, construction, scale and the
stable display pose across the entire sequence. Allow visually equivalent
orientations only when genuine rotational symmetry explains them. Missing
evidence is uncertainty rather than proof of symmetry. Synthetic tests exercise
these acceptance rules without establishing photographic quality or coherent
3D geometry.

## Sample rotation review

Check the home page at desktop, tablet and phone sizes, including a short laptop
viewport and a 320 × 568 phone. With no saved shoots or wallet panel, the header,
introduction, Add photos action, complete product preview, playback controls,
Show original control and footer should fit without page scrolling. Check that
the square photo keeps its proportions as the viewport changes. With enlarged
text or an unusually short viewport, content must remain reachable by scrolling.
Check the slim scrollbar on overflowing pages and dialogs, including its hover
state; forced-color mode should retain native scrollbar styling.

Inspect every loaded view against its original and its neighbors, including the
last-to-first wrap. Check product identity, material detail, body/handle/limb
proportions, attachment points, perspective, direction, occlusion, stable floor
contact and the complete silhouette below sticky controls. Hidden surfaces remain
inferred from the supplied originals.

After an authorized deployment, repeat the actual carousel review on desktop and
phone against the exact READY commit. Verify forward/reverse wraps, autoplay
across products, pause stability and original dialogs. HTTP success, image hashes
and registration checks do not substitute for this visual/interaction review.

Store session reports in `.internal/qa/YYYY-MM-DD-rotation.md` and captures or
measurements in `.internal/evidence/design/`. Local alignment utilities default
to this ignored evidence location and accept an explicit capture directory:

```sh
node scripts/verify-handbag-alignment.mjs
node scripts/verify-mug-alignment.mjs
```

They require previously captured paused frames and matching geometry; they do not
capture a browser or generate images. Keep only repeatable procedures, necessary
asset provenance and supported limitations in public documentation.
