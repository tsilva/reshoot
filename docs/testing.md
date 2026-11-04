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

## Accounts and simulated checkout

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
wallet. Simulated checkout tests cover authentication, same-origin requests,
forged prices/owners, declines, duplicate delivery, concurrent purchases, and
preservation of held credits and other accounts. They use synthetic database
fixtures and do not connect to Clerk, Stripe, Neon, or image providers.

Verify that the avatar’s Manage account panel contains Account, Security and
Credits. The header balance shortcut and the studio’s **Add credits** action must
open Credits directly. Existing `/account` and `?wallet=open` links must also
open that tab after sign-in, without adding an inline wallet to the workspace.
Check lazy loading, retry after a failed wallet request, closing/reopening for a
fresh balance, and the compact layout at desktop and phone widths. Pack selection
opens its confirmation within Credits; cancel/Done restores focus to the selected
pack. A successful simulated purchase must update the header balance and refresh
the studio quote without a page reload.

For configured browser verification, use two separate Clerk accounts. Confirm
that each sees only its own shoots and balance, then buy a test pack, cancel a
checkout, simulate a decline, and retry a successful purchase after a lost response.
Only a successful new purchase should raise the balance. Check sign-out and return
navigation, desktop and phone layout, and keyboard dismissal of checkout. The
simulator must never ask for card details. Full sign-in verification requires a
reviewed credential route and the additive account migration; source tests do not
establish that those external prerequisites are configured.

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
On supported touch devices, check the rear-facing **Take a photo** chooser.
Test preset controls,
original-image dialogs, completed gallery, ZIP download and error/empty states.
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
