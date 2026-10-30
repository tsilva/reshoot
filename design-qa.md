# Clean-focused sample carousel QA

Date: 2026-10-29

## Visual truth and evidence

- Selected visual: [target.png](design/qa/clean-focus/target.png), from the user's chosen ImageGen direction.
- Latest annotations override its thumbnail position and size: remove the Generated badge and product-selector footer; cycle products automatically; put previous/play/next below the image; align a light original thumbnail at the bottom-right on the same vertical level; enlarge on hover and open the original in a modal.
- Implementation: local Reshoot preview at `http://localhost:54225`, inspected in Brave.
- Desktop viewport: 1440 × 900 CSS pixels. Source raster: 1586 × 992; browser screenshot: 1425 × 891. The source was normalized to the implementation raster dimensions without changing its aspect materially. This is raster normalization, not a claim about the device's pixel ratio.
- State: cleaned linen doll front view, paused for a stable comparison. The Play icon is an intentional capture-state difference from the playing reference.
- [Full comparison](design/qa/clean-focus/comparison.png): source on the left, rendered implementation on the right, opened together before this report.
- [Focused toolbar comparison](design/qa/clean-focus/toolbar-comparison.png): the deliberately smaller original preview and lower position implement the final annotation. Navigation and thumbnail image centers both measured y=823 at the desktop viewport.
- [Compact desktop](design/qa/clean-focus/compact-desktop.png): 1280 × 720; hero bottom 710.4px, navigation and thumbnail image centers both y=643, no horizontal overflow.
- [Phone page](design/qa/clean-focus/mobile.png): 390 × 844 with natural page scrolling.
- [Desktop modal](design/qa/clean-focus/modal-desktop.png) and [phone modal](design/qa/clean-focus/modal-mobile.png): original photo, product name, clear close control and illustrative-example disclosure. Phone modal bounds x=12…378, y=193.6…650.3 fit the viewport.
- [Enlargement](design/qa/clean-focus/focus-enlargement.png): keyboard focus grows the 44px image to 110px using a 220ms transform while its layout width remains 44px.

## Findings

No actionable P0/P1/P2 visual findings remain against the selected direction and final annotations.

| Fidelity surface | Assessment |
| --- | --- |
| Fonts and typography | Existing Instrument Serif and Hanken Grotesk retained. Editorial headline wrapping preserved; desktop body increased to 18px and CTA to 17px after comparison. Secondary original label uses regular, muted 11px text. |
| Spacing and layout | Main product has a full-width image stage. All controls live beneath it; the original image aligns exactly with the 44px navigation buttons. No framed preview card, generated badge or product selectors remain. Hero fits the checked desktop viewports. |
| Colors and tokens | Existing white studio surface, warm brown CTA, ink and neutral rules retained. No new accent palette or preview shadow. |
| Image quality and assets | Existing approved studio assets and illustrative uploads reused. Their measured display registration and 10% product margins remain unchanged. Product imagery differs from the doll redrawn inside the ImageGen mock intentionally; the published product assets remain authoritative. Existing Phosphor icons supply UI controls. |
| Copy and content | Headline, explanatory copy and CTA retained. “Show original” is the secondary action. The modal identifies the upload as illustrative. Automatic rotation contains only cleaned views. |

## Comparison history

1. P2: initial implementation underused the desktop product area and rendered supporting copy too small relative to the selected design. Increased the responsive image cap and copy/CTA sizes; compared the revised capture again.
2. P2: early inline comparison changed stage height and misaligned captions; corrected, then superseded by the user's modal request. The final modal keeps the underlying stage fixed and reuses the existing native Dialog.
3. Final annotations: moved the preview into the control row, reduced its resting photo to 44px, added transform enlargement and a modal. The final combined comparisons and compact-desktop measurements show the requested layout.

## Interaction checks

- All 24 cleaned frames loaded; forward navigation crossed all three products and wrapped. Keyboard left/right also wrapped from doll front to handbag's last angle and back.
- Autoplay advanced to the next product. No original upload appears in the timed sequence.
- Opening the original modal held the background frame beyond a rotation interval. Closing it resumed playback from that frame.
- Close button, Escape, keyboard Enter activation, focus trap and return focus verified. Body scrolling is locked while open and restored after close.
- Phone modal photo and close control fit without horizontal overflow. Touch opens the original directly.
- Browser error log was empty after the final compact-desktop check.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (81 passed, one database test skipped), sample-framing verification and `pnpm build:secrets` passed.

## Verification limits and follow-up polish

The Brave adapter exposes no direct pointer-hover operation. The shared enlargement transform and transition were observed through keyboard focus; the fine-pointer hover media query is active and uses the same transform. Direct mouse-hover animation remains a manual review item. Reduced-motion animation removal and automatic-playback opt-out remain implemented; no separate emulated reduced-motion browser run was performed.

## Implementation checklist

- [x] Cleaned views stay dominant and rotate across products.
- [x] Original preview stays light and aligns with the control row.
- [x] Original opens in a keyboard-accessible modal.
- [x] Desktop and phone captures inspected; required fidelity surfaces reviewed.
- [x] Build, type, lint and existing tests pass.

## Center-axis correction — 2026-10-30

Products now use a fixed-camera turntable prompt around their own vertical center axis. All standard presets share level elevation. The pre-made sample registration centers the body at x = 50%; the bag uses its full body below the handles instead of a moving side-panel seam. A leather-specific mask excludes the brown floor shadow from its base measurement.

- Fresh Brave captures cover all eight bag views at 1456 × 812 desktop and 390 × 844 phone viewports. [Desktop rotation](design/qa/center-axis/desktop-rotation.png), [phone rotation](design/qa/center-axis/mobile-rotation.png), and [full desktop context](design/qa/center-axis/bag-0.png).
- [Screenshot measurements](design/qa/center-axis/measurement.json): body-axis spread 0 CSS px on desktop, 0.5 CSS px on phone; base spread 2 CSS px on both. Every captured image was loaded. All 24 studio images loaded in the browser.
- The sample regression check first failed against the old registration, then passed after correction. It remeasures all 24 source assets and checks centered axes, consistent floor contact, minimum 10% margins and unchanged provenance hashes.
- Final lint, TypeScript and tests passed: 82 tests passed, one database test skipped. The production build passed using dummy service settings; no paid generation or live service verification was performed. New generation behavior is verified at request construction; model output adherence remains a prompt target. Existing saved images are unchanged.
- Published rotation implementation: `33546a166f3827289c3c5c69e2a1858790d6a108`, [successful production delivery](https://github.com/tsilva/reshoot/actions/runs/41127149906), exact-commit Vercel READY deployment assigned to `reshoot.tsilva.eu`. Fresh Brave verification on the live domain covered all 24 rendered views, loaded images and playback. [Live measurements](design/qa/center-axis/live-measurement.json) confirm bag axis spread 0 CSS px on desktop and 0.5 CSS px on phone, with base spread 2 CSS px on both. Browser error log was empty. No paid image generation was used.
- Added the repository skill `reshoot_generate-rotation-images` for reproducing the source-image generation and verification process. Frontmatter, user-selected namespace and UI metadata validated; the installed Codex App Server discovered it as enabled in repository scope with the expected source path and display name. Creating the skill did not generate new artwork.

final result: passed
