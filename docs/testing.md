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

## Studio and gallery checks

Use synthetic/local fixtures for generation, credits and storage behavior. Browser
verification alone does not authorize a paid request, credit minting, migration
or changes to production data. Follow the repository's configured development
launcher and reuse existing servers.

At desktop and narrow phone sizes, verify that **Add photos** opens an empty
shoot workspace without an upload dialog. Test file selection and page-wide
file drops, additional photos, invalid file types, upload limits, progress,
partial failures and retrying only failed files. Generation must stay disabled
until saved references are ready, and show the quoted credits in smaller text below Generate inside the button, without a view count or explanatory label. Select each thumbnail with mouse and keyboard to verify that the large preview changes without changing the quoted cost. Check the top-left remove control and preview fallback after removing the selected reference. Check that adding and removing saved photos refreshes the quoted cost, including removing the primary, removing the last reference and crossing the five-reference cap. The drag target must contain no price. Removal must check ownership, serialize with generation confirmation and reject generated shoots. A removed photo must not be restored by replaying upload finalization.
Verify that busy or completed shoots reject drops without navigating to the file.
On supported touch devices, check the rear-facing **Take a photo** chooser.
Test preset controls,
original-image dialogs, completed gallery, ZIP download and error/empty states.
Check keyboard access, focus, image loading, persistent controls and console
errors. Verify pause/play, previous/next wrapping, arrows, product boundaries,
menu/dialog pause, image-readiness waits and reduced-motion opt-in. A single-view
shoot must not expose ineffective navigation.

## Sample rotation review

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
