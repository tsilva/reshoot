# Reshoot single-page studio QA

## Full-screen mobile dialogs — 2026-10-29

Mobile dialogs now cover the complete dynamic viewport instead of displaying a bottom sheet limited to 92vh. This applies up to 850px wide, plus short touch-device landscape screens. The upload panel uses a fixed header/footer with a flexible scrolling content area; controls include safe-area padding. The background page is scroll-locked only while a mobile dialog is open. Checkout panels use the same full-screen sizing, with their own scrolling content. Desktop dialogs retain their centered, bounded layout.

Brave measured the upload panel at exactly (0, 0) with the viewport’s full width/height at 320 × 568, 390 × 844, 667 × 375, and 844 × 390. Its footer stayed at the viewport bottom. At 1440 × 1000, it remained 720px wide and centered. Closing restored root overflow and removed the modal. Short landscape content had scrollHeight greater than clientHeight with overflow:auto; an attempted native wheel check timed out, and PageDown on the file input did not scroll, so wheel/touch scrolling was not independently exercised. See [mobile](design/qa/fullscreen-modal/mobile.png), [landscape](design/qa/fullscreen-modal/landscape.png), and [measurements](design/qa/fullscreen-modal/verification.json). Lint, TypeScript, and whitespace checks passed. Verified locally; no deployment performed.

## Automatic shoot names and phone capture — 2026-10-29

The creation dialog starts with photos and no name field. It requires at least one photo before creation. On touch devices with native file-capture support, a separate Take a photo button requests the environment-facing camera; existing photo selection remains available. Both paths share validation, limits, upload progress, and retry handling. Desktop browsers without touch support keep the file picker alone.

After the first primary original is verified and saved, a normalized 640px preview is sent inline to the vision naming model through existing environment-specific routing. The eight-second, 80-token request returns a short product title; failures retain Product shoot without failing or deleting the saved upload. A conditional asset transition prevents concurrent finalization retries from requesting naming twice. Conditional title/primary/owner/deleted checks preserve concurrent edits and workspace boundaries. Later originals and ready retries do not rename the shoot.

A real Development API upload of the public sample mug as `IMG_1234.jpg` saved one ready original and produced **Blue ceramic mug** in 7.88 seconds through the configured provider. The temporary Development shoot was moved to deleted projects afterward; normal retention remains in place. No generated image or generation-credit hold was created. Brave verified the missing name field, disabled empty-submit action, file-chooser invocation, keyboard focus on photo selection, and no overflow at 390 × 844. See [desktop](design/qa/photo-naming/desktop.png) and [narrow layout](design/qa/photo-naming/mobile-layout.png).

Brave’s extension blocked automated file selection because file-URL access is disabled, so the saved-photo/provider check used the local app API. A resized desktop window does not emulate a phone camera: native capture on physical iOS/Android hardware remains unverified. No browser warnings/errors were captured. All 80 unit tests plus four provider-routing checks, lint, TypeScript, production build, and whitespace checks pass; one opt-in database test remains skipped. This update is local.

## Playback control fix — 2026-10-29

Reproduced Play changing its label to Pause without advancing the mug for 2.1 seconds while the pointer remained over the button, with all photographs loaded. The existing mouse-hover pause still blocked the timer after the explicit Play action.

Play now clears both current interaction-pause flags. Subsequent pointer entry or control focus can pause again; image loading, viewport visibility, reduced-motion defaults, and manual-navigation pauses retain their existing behavior. The button keeps keyboard focus when activated.

Brave verified pointer Play advancing while hovered and focused, Pause holding its frame, Space to resume, Enter to pause, and playback/pause on all three products. Later keyboard focus, mouse re-entry, and manual Next each paused as expected. Assertions checked the observed transitions in [behavior.json](design/qa/playback-controls/behavior.json). No browser warnings or errors were captured; lint, TypeScript, and whitespace checks passed. Verified locally at `http://localhost:63573/`.

## Thumbnail product selectors — 2026-10-29

The product selectors are now 72 × 72 image buttons using each product’s source photograph. A contrasting clay border marks the selected product. Accessible product names, hover titles, pressed state, and visible keyboard focus remain; thumbnail images are decorative and load eagerly.

Brave verified all three thumbnails loaded, pointer selection, Space/Enter activation, source-view reset, and matching selected states. At 320 × 1000 CSS pixels, all three 72px buttons fit without horizontal overflow. No browser warnings/errors were captured. Lint, TypeScript, and whitespace checks passed. See [desktop](design/qa/product-selectors/desktop.png) and [mobile](design/qa/product-selectors/mobile.png).

## Leather handbag rotation — 2026-10-29

Leather handbag is the third selectable example. Built-in imagegen prepared a straight-front source from the approved concept, then seven independent edits from that same source. All eight 1254 × 1254 photographs preserve cognac pebbled leather, stitching, two top handles, camera-left lighting, and rightward shadows. Front/three-quarter views show the clasp; side profiles are narrow, and rear views use a plain panel without duplicating the front clasp. Unseen construction remains a generative estimate. Exact prompts and source artwork are in [generation.json](design/qa/leather-handbag/generation.json).

Measured color-isolated silhouettes determine per-frame uniform scale and translation, registering the handle height, rotation axis, and resting baseline. Width changes remain natural across side and front views. Raw framing observations and parameters are in [framing.json](design/qa/leather-handbag/framing.json).

Independent browser-pixel checks across all eight views measured center spread of 0.56 CSS pixels on desktop (1440 × 1000) and 0.59 on mobile (390 × 1000); handle-top spread stayed below 0.7 pixels and floor-edge spread below two pixels. Color-boundary interpolation avoids rounding every contour to an integer screenshot pixel. The detector accounts for per-frame page scroll and rejects captures with clipped viewers. The final two-pixel tolerances are unchanged. Fresh screenshots, geometry, and measurements are in [alignment/](design/qa/leather-handbag/alignment/). Run `node scripts/verify-handbag-alignment.mjs` after refreshing those browser captures.

All twenty-four product photos preload and stay mounted. Brave checked every handbag view and wraparound with full opacity and no animation, product selection, and mobile layout. Lint and TypeScript pass. The existing doll and mug sets, rotation controls, badges, and workspace flow are retained. This update is local; no deployment was performed.

## Mug rotation alignment — 2026-10-29

The independently generated mug photographs placed the ceramic foot at different horizontal coordinates. Actual browser captures of the original front and back showed 27.3 CSS pixels of body movement at a 1440 × 1000 viewport. Matching image dimensions and a fixed viewer did not prevent this movement inside the photographs.

Source-pixel offsets now register the mug’s ceramic foot to a common anchor at (627, 1003) in each 1254 × 1254 photograph. The carousel applies these as responsive percentage translations; product scale, lighting, image files, preloading, and opacity remain unchanged. The handle can move around the anchored body. The doll has no registration offsets.

Independent pixel measurements in fresh screenshots of all eight views found a maximum body-center spread of 1.01 CSS pixels on desktop and 0.52 on mobile (390 × 1000), both below the two-pixel tolerance. The detector measures the unobstructed body edges above the foot, below all handle positions; it does not compare configured offsets. Inputs and observations are in [alignment/](design/qa/ceramic-mug/alignment/), with results in [measurement.json](design/qa/ceramic-mug/alignment/measurement.json). Rerun `node scripts/verify-mug-alignment.mjs` after capturing fresh paused frames and their viewport geometry there. Changing viewport or scroll position requires matching per-frame geometry.

All eight frames were loaded and remained fully opaque with no animation during the browser pass. Lint, TypeScript, and whitespace checks passed.

## Ceramic mug rotation — 2026-10-29

The first additional product is the cobalt-blue ceramic mug. Built-in imagegen prepared a source frame and seven independent rotation edits from that same frame; no rotated output was used to create another. The eight 1254 × 1254 photographs retain the cobalt glaze, curved handle, camera-left highlights, and rightward floor shadows. Visual inspection checked handle occlusion behind the mug and the edge-on handle facing the camera. These are generative estimates of the product's unseen surfaces. Exact prompts, source artwork, and JPEG asset paths are recorded in [generation.json](design/qa/ceramic-mug/generation.json).

A product selector below the viewer switches between Linen doll and Ceramic mug. Selecting a product resets to its source view and pauses playback until Play is selected. All sixteen photographs preload and stay mounted, with loading tracked per product so one set does not block another. The existing automatic-rotation controls, provenance badges, reduced-motion behavior, and no-fade image changes are retained.

Brave checks at `http://localhost:63573/` passed all eight mug positions and wraparound, source-view reset when switching products, autoplay resumption, full-opacity/no-animation frames, and sixteen responsive photo preloads. At 390 × 844 CSS pixels there is no horizontal overflow and both product buttons have 44px minimum height. Browser warnings/errors were absent. Lint, TypeScript, and diff whitespace checks passed. See [desktop](design/qa/ceramic-mug/desktop.png) and [mobile](design/qa/ceramic-mug/mobile.png). The handbag and skincare jar remain proposals; this step adds only the mug. No deployment was performed.

## Automatic sample rotation — 2026-10-29

The eight-view sample is now a self-contained `SampleCarousel`. After all eight photos load, it advances every 900ms and wraps around. Frames switch at full opacity using the existing mounted/preloaded photographs; there is no CSS rotation of the photograph and no reintroduced fade. Carousel state updates no longer re-render the wallet, upload flow, or saved shoots.

A 44px pause/play control sits at the lower right of the viewer. Mouse hover, keyboard focus, insufficient viewport intersection, and document visibility gate the timer; previous/next and arrow-key navigation pause playback until Play is selected. Reduced motion defaults to stopped unless the viewer explicitly opts in. Automatic frames have `aria-live="off"`; manual navigation uses polite announcements. Timers, intersection observation, and browser subscriptions clean up on pause/unmount.

Brave at `http://localhost:63573/` confirmed a full eight-view loop in the correct order with matching provenance badges, persistent Pause, Play resumption, hover pause, focus pause, manual keyboard navigation and persistent manual pause, and offscreen pause at 390 × 400 CSS pixels. At 390 × 844 CSS pixels the pause control fits with no horizontal overflow. Eight image preload links remain present. The [behavior receipt](design/qa/auto-rotation/behavior.json) preserves observed transitions and check outcomes. Reduced-motion preference changes and a truly hidden browser document were reviewed in source but were not independently exercised: opening another automation tab did not hide the tested document. No browser errors or warnings were captured.

[Desktop](design/qa/auto-rotation/desktop.png) and [mobile](design/qa/auto-rotation/mobile.png) show the added control. An initial desktop screenshot taken immediately after changing responsive viewport size preceded image paint and was discarded; the replacement was captured after the photos had painted. Layout, fonts, existing medallions, photo treatment, and previous/next controls remain consistent with the badge design; only the requested rotation control is added.

`pnpm lint`, `pnpm typecheck`, the four provider-routing checks, and 61 application tests passed (one opt-in database test skipped). An initial plain build reached configuration collection but lacked `DATABASE_URL`; the build then passed with the same dummy loopback database and R2 settings used by checked-in CI, without fetching credentials or contacting real application services. This change is local and has not been published.

## Visual provenance badges — 2026-10-29

**Findings:** No actionable P0/P1/P2 differences in the scoped badge update. **final result: passed**

**Source visual truth:** User-selected option 01 in [reference.png](design/qa/badges/reference.png), with an explicitly requested matching Original badge. Built-in imagegen produced two transparent medallions: sparkle for Generated and camera for Original. The shared ivory/silver finish, circular rim, and compact pill follow the selected option; the shallower pill bevel and lighter shadow are intentional adaptations for a small UI label. Exact prompts and production assets are recorded in [generation.json](design/qa/badges/generation.json).

**Implementation evidence:** [Desktop Original](design/qa/badges/desktop-original.png), [desktop Generated](design/qa/badges/desktop-generated.png), [mobile Original](design/qa/badges/mobile-original.png), and [mobile Generated](design/qa/badges/mobile-generated.png), captured in Brave at `http://localhost:63573/`. Desktop captures are 1440 × 900 pixels at a 1440 × 900 CSS viewport; mobile captures are 390 × 844 pixels at a 390 × 844 CSS viewport. The mobile screenshots are scrolled to the sample after control interaction. A further 320 × 740 CSS viewport check found no horizontal overflow.

**Comparison:** [Context comparison](design/qa/badges/context-comparison.png) places the 1536 × 1024 source concept sheet and desktop implementation together, each resized proportionally into a 768 × 512 panel. The source is a component exploration sheet, not a full-page layout; only option 01 defines the badge target. The [focused comparison](design/qa/badges/badge-comparison.png) shows the source badge above both actual rendered badges; implementation crops are enlarged 4× for inspection, which introduces visible pixel scaling. No full-page layout change was requested.

- Fonts/typography: existing Hanken Grotesk, 12px/600 live labels, no wrapping or image-rendered text. Labels and the existing live status retain accessible provenance; decorative medallions are hidden from assistive technology.
- Spacing/layout: 32px pill, 44px image box with transparent inset around the disc, camera/sparkle aligned with the text baseline and clear of the product. Both widths fit at 320px and 390px.
- Colors/tokens: warm ivory surface, silver rim, restrained blue/lavender/champagne reflections, dark readable text, reduced elevation following option 01.
- Image quality: genuine transparent 1254px source art, lossless 160px WebP assets, no baked background, no visible halo on white at display size. Both eagerly loaded assets stay mounted so view switching does not wait for a new emblem request.
- Copy/content: Original appears only for front/source; Generated appears for all seven other views. Existing carousel content and navigation are preserved.

**Checks:** All eight views matched the correct label and emblem; forward wraparound and ArrowLeft/ArrowRight transitions passed. Both emblems were loaded before view changes. No browser warnings or errors were captured. `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed. `pnpm build` failed because Next.js could not fetch Hanken Grotesk and Instrument Serif from Google Fonts; production build verification remains blocked by that connection failure. No workspace, billing, storage, credit, or application image-generation operations were exercised.

**Comparison history:** The first scoped visual comparison passed; no P0/P1/P2 visual repair loop was needed. **Implementation checklist:** both generated assets installed, live labels applied, eight-view provenance checked, desktop/mobile comparisons reviewed, README updated. Existing private inbox entries concern production services and are unaffected by this badge change.

## Eight-view rotation — 2026-10-29

Added back-right and back-left three-quarter photographs between the side profiles and straight-back view. The carousel now follows eight positions around the doll: front, front-right three-quarter, right profile, back-right three-quarter, back, back-left three-quarter, left profile, front-left three-quarter.

Both new 1254 × 1254 assets are independent built-in imagegen edits of the approved back photograph with the corresponding side profile as a geometry reference. Visual inspection confirmed rear/side geometry, consistent full-body framing, camera-left highlights, and rightward floor shadows. No CSS mirroring is used. Exact prompts, references, and output paths are in [rear-generation.json](design/qa/rotation-lighting/rear-generation.json).

Brave checks at `http://localhost:63573/` confirmed all eight distinct images loaded before interaction, eight responsive preload links, one visible loaded image at each position, forward and reverse wraparound, and keyboard navigation. The repeated fade-in animation was removed to eliminate flashing on view changes; a subsequent pass through all eight views confirmed each selected image was loaded, fully opaque, and had no animation or transition. No browser warnings or errors were captured. Lint and TypeScript passed; lint also passed after the CSS animation removal.

## Left-view lighting and early loading — 2026-10-29

The home carousel now contains six photographs: front, right three-quarter, right profile, back, left profile, and left three-quarter. All six responsive images have preload links in the initial HTML and remain mounted; only the selected image is visible and exposed to assistive technology.

The two left views are independent built-in imagegen edits of the matching approved right views, with the approved front and back photographs as lighting and framing references. Both retain 1254 × 1254 dimensions. Visual inspection confirmed left-facing geometry, warm ivory cloth and cream yarn, full-body framing, camera-left highlights, and floor shadows extending right. The CSS horizontal flip and Mirrored badges were removed. Only JPEG format conversion followed generation. Exact prompts, input roles, and asset paths are recorded in [generation.json](design/qa/rotation-lighting/generation.json).

Brave inspection confirmed six distinct loaded image sources and six preload links. After a transient development database query failure recovered, the final check at `http://localhost:63573/` passed all six positions, forward and reverse wraparound, one visible loaded photograph per position, and no CSS transforms. An intermediate public-sample check at `127.0.0.1` rendered the images, but its controls did not update while Next.js blocked that origin's development resources; the passing interaction check used localhost. Lint and TypeScript passed. This check did not exercise workspace mutations, storage, billing, or application image-generation services.

## White studio and simplified carousel — 2026-10-27

**Findings:** No remaining actionable P0/P1/P2 issues in the reviewed states. **final result: passed**

**Visual truth:** The selected [white mockup](design/qa/white-studio/reference.png), refined by the user's [annotated request](design/qa/white-studio/annotated-request.png). Those annotations explicitly replace the thumbnail rail with previous/next controls, remove header navigation, the separate original-photo block and the sample note, and add Original/Generated badges. The later request to remove redundancy also overrides repeated marketing sections in the mockup.

**Implementation:** `http://localhost:64456/`, verified in Brave. [Desktop](design/qa/white-studio/desktop.png), [complete page](design/qa/white-studio/desktop-full.png), [mobile](design/qa/white-studio/mobile.png), [mobile carousel](design/qa/white-studio/mobile-carousel.png), and [wallet](design/qa/white-studio/wallet.png). The current-run [before capture](design/qa/white-studio/before.png) records the redundant labels, repeated upload sections, and oversized empty-library illustration that were removed.

### Comparison evidence

- [Full-view comparison](design/qa/white-studio/comparison-final.png): selected mockup, annotated request, then implementation, each normalized to a 720 × 450 panel without stretching. Source pixels: 1586 × 992 and 2898 × 1828. Implementation: 1425 × 891 pixels captured at a 1440 × 900 CSS viewport; the browser capture is approximately CSS-pixel density. The photo state is front/original for the annotation and implementation; the original mockup's three-quarter state is a style reference, not a requirement to mislabel the front view.
- [Focused photo comparison](design/qa/white-studio/photo-comparison.png) checks subject detail, white background, framing, and shadow treatment. Regions are shown within equal 620 × 620 panels; the deliberate removal of the sidebar gives the implementation a wider stage. Product colors, face, cream yarn, linen texture, and rightward shadows remain consistent.
- Fonts/typography: Instrument Serif and Hanken Grotesk retain the chosen editorial hierarchy. Removed decorative handwritten copy also removes the unused Caveat font. Copy and CTA wrap cleanly at 1440, 768, 390, and 320 CSS pixels.
- Spacing/layout: one hero, one image stage, compact saved shoots, and a minimal footer. The removed sidebar, repeated headings, angle captions, page counter, original thumbnail, second upload pitch, and empty-library illustration are intentional user-requested reductions. No horizontal overflow at tested widths.
- Colors/tokens: white page, image surfaces, dialogs, browser theme, and installable-app theme; espresso text, clay primary action, restrained olive account accents, and neutral rules. No brown outer frame or photo tint.
- Image quality: four independent parallel background edits retain 1254 × 1254 output dimensions. A narrow horizontal edge mask fades only the surrounding photo background; the doll remains opaque and uncropped. Assets and exact built-in imagegen prompt set are recorded in [generation.json](design/qa/white-studio/generation.json).
- Copy/content: the product explanation and upload action remain. Only requested Original/Generated badges appear on the photo; screen-reader status includes view and position. The test-credit/no-payment helper remains. The visible sample disclosure was removed at the user's explicit request; hidden surfaces remain estimates as documented in the README.

### Audit steps and interaction checks

1. Homepage: passed. The original full-page capture showed repeated product pitches, repeated angle labels and navigation, and duplicated upload actions. The final page removes those elements and keeps the primary action visible on the first mobile screen.
2. Carousel: passed. Next cycles original/front → generated/three-quarter → generated/side → generated/back → original/front. Previous wraps in reverse. ArrowLeft/ArrowRight work while a carousel control has focus; a live status announces the view. Buttons have accessible names and 48 × 48 CSS-pixel touch targets. Sample browsing leaves credits unchanged.
3. Upload: passed. The primary action opens the existing product-photo dialog; closing returns to the page. No files were uploaded or projects created.
4. Wallet: passed. The header balance opens the existing inline wallet and credit history; closing preserves the landing page. No pack, checkout, payment, or credit grant was submitted.

### Comparison history and limits

The first [comparison](design/qa/white-studio/comparison.png) found a P2 photo-edge seam: the shadow stopped at the raster boundary. The horizontal mask initially covered the wider element rather than its contained square image. Constraining the image to its actual rendered square and centering it applies the fade to the raster edges; the final comparison and focused crop show the repaired transition. A malformed full-page mobile capture was rejected and replaced with the verified top-of-page viewport capture.

Final pre-push checks on the combined repository state passed: lint, TypeScript, the production build, 61 Vitest tests (one database test skipped), four provider-routing checks, and 11 secret-launcher tests. An initial design test run concurrent with the production build hit the existing ESLint integration test's five-second timeout; the non-concurrent retry passed. The final CSS-only edge and unused-style cleanup was verified in the browser and with lint. No browser errors were captured. One development LCP warning from an earlier hot-reload state remains in the log; the final image explicitly has `loading="eager"` and `fetchPriority="high"`.

Screenshots and keyboard checks do not establish complete accessibility compliance. Upload/storage writes, real image-service generation, real billing, and production delivery were not exercised. Existing auth, billing, storage, and telemetry items in the private repository inbox remain outside this design change.

**Implementation checklist:** White photo assets, white surfaces, minimal content, cyclic controls, provenance badges, responsive layout, upload/wallet preservation, visual comparisons, and documentation complete.

**Follow-up polish:** None required for this scope. **final result: passed**

## Clearer first screen and frameless page — 2026-10-26

The first screen identifies Reshoot as AI product photography, explains that one uploaded product photo becomes multiple views, and leads with “Upload your product photo.” The example identifies the input photo and offers four views. The lower call to action also opens upload rather than the wallet. Test-credit and hidden-surface disclosures remain visible.

The brown outer background, page border, and outer spacing are removed across breakpoints; the cream background fills the viewport. The content keeps its readable maximum width and internal spacing.

Brave checks confirmed the primary action opens the existing product-upload dialog. Desktop, 768-pixel tablet, and 390/320-pixel mobile layouts have no horizontal overflow. At 390 × 844 pixels, the primary upload button appears on the first screen. Lint, TypeScript, and the production build passed for the copy and CTA update; the subsequent frame removal changes only the outer CSS. See the updated [desktop](design/qa/clarity/desktop.png) capture.

## Consistent linen-doll sample — 2026-10-26

The approved front photograph and four-view preview supplied the same references to four independent, parallel built-in image-generation calls. No newly generated view was used to generate another. Each prompt kept the camera and camera-left softbox fixed while rotating only the doll to 0°, 45°, 90°, or 180°, with matching full-body square framing and rightward floor shadows.

The individual 1254 × 1254 photographs replace the four JPEGs in `public/assets/angle-guides/`. JPEG export preserves the generated dimensions. Static image imports give changed assets new URLs; the starting-point photo, selected view, and thumbnails share those assets. The viewer uses `object-fit: contain` to preserve the whole doll across desktop and mobile layouts.

Brave verification: all four angle buttons update the photograph and pressed state; every main image and thumbnail loads. Desktop frames remain 623.5 × 498 pixels for all angles. At a 390 × 844 mobile viewport, the image is 321 × 321 pixels and the page has no horizontal overflow. See [desktop](design/qa/doll/desktop.png) and [mobile](design/qa/doll/mobile.png) captures.

Lint, TypeScript, and the production build pass. The test suite passes 42 of 43 checks; the unchanged dependency audit reports seven advisories in `undici` and `fast-uri`. No dependencies or application generation/credit paths changed.

## Mudora-inspired visual redesign — 2026-10-23

**Findings:** No remaining actionable P0/P1/P2 findings in the reviewed states.

**Visual truth:** [Mudora — Pottery and Ceramics Landing Page, RylicStudio](https://dribbble.com/shots/26596729-Mudora-Pottery-and-Ceramics-Landing-Page), with the selected public poster at `https://cdn.dribbble.com/userupload/45134256/file/still-78859d86c028ce02589720f6259766a5.png`. Its browser capture is [mudora-reference.jpg](design/qa/artisan/mudora-reference.jpg).

**Implementation:** `http://localhost:51276/`, tested in Brave Stable. [Desktop viewport](design/qa/artisan/desktop-home.jpg), [complete page](design/qa/artisan/desktop-full.jpg), [phone home](design/qa/artisan/mobile-home.jpg), [phone sample](design/qa/artisan/mobile-sample.jpg), [phone wallet](design/qa/artisan/mobile-wallet.jpg), [phone upload dialog](design/qa/artisan/mobile-upload.jpg), and [tablet](design/qa/artisan/tablet-home.jpg).

This is an adaptation of the selected reference for Reshoot, rather than a clone of a pottery shop. The reference is a framed desktop mockup; Reshoot is a live product with different content and controls. Product imagery, interactive angle selection, private workspaces, credit accounting, and inline project/wallet behavior take precedence over matching the reference's commerce content.

### Comparison evidence and normalization

- Full-view comparison: [comparison.png](design/qa/artisan/comparison.png), with both browser captures together at 720 pixels wide each. The source capture is 1436 × 867 pixels; the desktop implementation capture is 1421 × 803 pixels. The live desktop CSS viewport reported 1436 × 811 with devicePixelRatio 2; browser capture output is normalized to approximately CSS-pixel resolution. Differing frame margins and viewport heights are intentional and are not treated as fidelity errors.
- Focused typography comparison: [typography-comparison.png](design/qa/artisan/typography-comparison.png). Source and implementation headline regions are cropped from those same captures and scaled to 520 pixels wide each. This checks serif contrast, condensed proportions, handwritten accents, wrapping, and optical hierarchy; it does not assert identical fonts or pixel coordinates.
- Responsive CSS viewports: 390 × 844, 768 × 1024, 600 × 900, 540 × 900, and 320 × 800. Phone and tablet capture files exclude the browser scrollbar area. Document width never exceeds the tested viewport. Temporary viewport overrides are reset after verification.
- Desktop state: private browser workspace with its initial 1,000 test credits, sample visible, wallet closed. Phone states include sample, open wallet, and upload dialog. No additional top-up or paid generation was submitted.

### Required fidelity surfaces

- **Fonts and typography:** Instrument Serif in normal and true italic supplies the high-contrast editorial display style. Caveat supplies handwritten accents, and Hanken Grotesk keeps small controls legible. These are deliberate available-font interpretations; the reference's original font files were not supplied. Fonts load through `next/font` and are self-hosted. Headings wrap cleanly across tested widths; hidden line breaks preserve spaces.
- **Spacing and layout:** Cocoa outer frame, centered wordmark, fine column rules, generous editorial headline, large product image, compact angle rail, original-photo note, and olive circular actions echo the reference. On phones, the image and four angle buttons stack. Wallet and library surfaces have square corners and restrained borders. The real studio retains its existing functional structure.
- **Colors and tokens:** Shared tokens now use parchment `#f2e7d2`, espresso `#291c16`, clay `#602912` / `#8c4a2b`, olive `#4c503a`, and sand `#c6b6a0`. Body and muted text remain visibly legible on their surfaces. Selected angles have a border and checkmark as well as color; focus indicators remain visible.
- **Image quality:** Existing Reshoot photographs are reused. Product previews retain their original colors, without a blend-mode tint. Responsive image dimensions remain explicit; actual product photos replace the reference's pottery because this is Reshoot's working demonstration. Phosphor icons supply functional symbols; no pottery artwork or custom imitation illustration was introduced.
- **Copy and content:** The page introduces product photography, invites visitors to use the sample or start a shoot, explains credit quotes, and clearly labels fake credits and disabled real billing. No design-reference language appears in the customer experience.

### Comparison history

1. The first browser review found a product-photo tint that changed the sample's appearance. Removed the multiply blend; final desktop and phone captures show the original photo colors.
2. The phone review found missing spaces when editorial line breaks were hidden, such as “oneordinary” and “everylittle.” Added explicit spaces; final phone sample and home captures show the repaired copy.
3. The responsive review prompted a fluid tablet headline size and constrained grid tracks. The final 600-pixel and 320-pixel checks report no overflowing elements; the tablet capture documents the resulting editorial layout.
4. The final combined full-view and focused comparisons found no remaining P0/P1/P2 issues. Differences in copy, product subject, lettering, and interactive layout are accepted adaptations to the user's inspiration request.

### Interaction and engineering checks

- Sample selection updates the main image and pressed state without spending credits.
- Header wallet and the circular wallet call to action open the wallet on the same page; closing it preserves the workspace.
- A credit pack opens the existing no-charge checkout confirmation, displaying $0 charged. Confirmation was not submitted.
- Starting a shoot opens the existing upload dialog on desktop and phone. Escape closes it and restores focus to the triggering button.
- No browser console errors or warnings were captured in the final reviewed state.
- ESLint, TypeScript, 37 application tests, and the production build pass. The previously documented dependency-audit failure remains outside this visual change; dependencies were not changed.
- No paid generation, actual payment, migration, reconciliation, or cleanup was run. Existing upload/generation/account logic was retained; uploading and generating new assets were not repeated for this visual pass.

**Implementation checklist:** Visual system, responsive layout, interactive sample, inline wallet/dialogs, keyboard dismissal, documentation, and build checks complete.

**Follow-up polish:** No blocking polish items. An exact licensed Mudora font match would require the original design's font information; the current display and handwritten fonts are intentional interpretations.

**final result: passed**

## Previous functional verification — 2026-10-21

The home page is both the introduction and the working studio. A visitor can explore four pre-made product angles before starting a private browser workspace. The sample uses no credits. Uploading or opening a saved shoot replaces the sample canvas with the real studio; photos, shot selection, exact quotes, review, history, and exports stay on the home page.

The header keeps the available test-credit balance accessible. The wallet expands inline with available and held credits, shot estimates, credit packs, and activity. No-charge test checkout remains available only where the existing server policy permits it. Real billing is not enabled.

Older `/login`, `/projects`, `/projects/<id>`, and `/account` links redirect to the appropriate home-page state. Saved shoots retain an address at `/?project=<id>#studio`; wallet links use `/?wallet=open#wallet`. Every project lookup still checks ownership on the server.

## Verified interactions

- Anonymous visitors can view the sample without a session. Switching the sample angle changes the displayed image and pressed state.
- A signed-in browser can upload a repository sample image, save a project, and enter its studio inline. The library then shows one finalized original and its preview.
- Saved projects open inline with their existing references and versions.
- Four selected shots produce a 160-credit quote with one reference per shot. Generation confirmation was not triggered.
- A Starter test top-up adds 1,000 fake credits with a displayed $0 charge; the success dialog, header, wallet, and credit activity reflect the updated balance without navigation.
- Wallet updates invalidate the studio's displayed quote so the next quote uses the new balance.
- Upload dialogs retain the existing limits, progress, and retry controls. Keyboard focus stays in native dialogs and returns to the trigger on close.
- The sample and working studio render at desktop width and 390 × 844 mobile dimensions. Mobile has no horizontal overflow and the uploaded preview loads.
- The session route tests cover both form redirects and inline JSON responses, transactional initial grants, existing-session reuse, and cross-origin rejection.

## Checks and limits

ESLint, TypeScript, and 37 application tests pass. The production build passes using the existing Infisical launcher. The complete test suite has one unrelated dependency-audit failure: the existing Vite 8.1.5 dependency through `@workflow/vitest` has three registry advisories (one high and two moderate). Dependency inputs and package-age protection were preserved.

No real payment, paid image generation, migration, reconciliation, or retention cleanup was run during this redesign.

## Historical design sources

The previous multi-page layout used the Stitch project `3558731671754376663` and the Technical Curator design system `d1b7688524cb4b23a60a581c874a6138`. Its exports remain in `design/stitch-source` as historical references. The current studio keeps the existing brand assets, warm ivory surface, product photography, and private project boundaries while replacing the separate welcome, projects, studio, and account navigation.
