# Reshoot single-page studio QA

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
