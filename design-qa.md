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

## Rigidity review — 2026-10-30

The user rejected the bag's rear/three-quarter transition after live delivery: the bag changes dimensions and does not look like one object rotating in place. The earlier numeric results establish body-center/base registration and successful playback only. They do not establish consistent geometry, camera perspective, handle proportions or a natural rotation. The visual rigidity verdict is **failed**; the rotation task is reopened.

Three native image-generation candidates were tested: one coordinated eight-view layout and two individually constrained rear views. They still changed construction/proportions or duplicated a rear orientation, so none replaced the published artwork. A foreground cutout was prepared from the existing illustrative source and supplied to the official Microsoft TRELLIS.2 demo through its anonymous public API. Its shared-shape preview was inspected, but repeated front hardware on the rear made it unsuitable. GLB export was also blocked by the demo's GPU quota. These trials remain outside public assets; no replacement was deployed.

The skill now requires separate geometry and registration verdicts. A rigid turntable should come from one accepted shared asset with a fixed rig or a genuine photographic turntable sequence. A single source image can leave unseen construction ambiguous. Future acceptance must inspect body height/depth, rim, handle rise/shape/attachments, flap, perspective, all adjacent views and the wrap; a green centering test is insufficient.

Final result: registration and production delivery passed; the bag's visual rigidity failed and remains unresolved.


## 2026-10-31 — Original-first photographs with textureless orientation hints

The user rejected direct photographs of reconstructed meshes for low visual quality. That candidate artwork was archived outside public assets and restored before the replacement workflow; none of it was committed or deployed. The generation skill now requires native image generation from the authoritative original, with an untextured/wireframe mesh capture serving only as an orientation hint. Proxy materials, coarse surfaces and render appearance must not replace source photographic detail.

Twenty-four doll/mug/handbag photographs were regenerated with the original as Image 1 and a neutral-gray pose hint as Image 2. The doll proxy is a source-derived Hunyuan3D-2.1 shape; the mug's first inferred proxy had a tilted rim, so it was replaced with a simple level circular cup/loop scaffold. The source photo remains authoritative for the actual cup and glaze. Every hint set uses fixed 8-degree camera elevation and scale with object yaw only. Native photographs preserve source linen/yarn/embroidery or cobalt ceramic detail. Two rear-quarter mug views were retried to put most of the handle behind the cup. Exact selected prompts, source/guide roles, hashes and generation artifacts are in `design/qa/orientation-guided-rotation/photographs.json`. Unselected attempts are retained in the task's external working artifacts; no application credits were used.

The new photos use measured body-axis and per-product floor registration, uniform scale/translation and at least 10% product margins. Hint rig/source checks apply only to the guides. They do not establish that final AI photographs have identical 3D geometry. Visual review compares photographic quality, original identity, whole-body pose, body/handle proportions, near/far occlusion, rear transitions and the wrap. Browser and live observations are added after verification. The bag’s earlier independent artwork was also replaced. Its source-derived approximate scaffold fixes the body/handle construction for orientation hints; the final photographs retain the original leather and stitching. Front/back body and handle proportions, near/far panels and profile occlusions were reviewed before expanding to all eight bag views.


### Live acceptance — 2026-10-31

Brave verification on `https://reshoot.tsilva.eu/` covered the exact READY photography commit `a7e6ed1b883ab11f57b1f5d20172d6564ccd306d`. All 24 expected views were loaded and inspected at 1440 × 960 desktop and 390 × 844 phone sizes. [Desktop views](design/qa/orientation-guided-rotation/live-desktop.png), [phone views](design/qa/orientation-guided-rotation/live-phone.png), and the [verification record](design/qa/orientation-guided-rotation/live-review.json) retain the result.

The three sequences pass this visual review: body height and floor contact appear stable, profiles foreshorten naturally, and the face/handle/panel occlusions follow the expected rotation. No obvious dimension jump or camera orbit was observed in the bag sequence. This supersedes the earlier failed bag-artwork verdict for the replaced photographs; visual acceptance does not establish mathematically identical 3D geometry, and unseen surfaces remain inferred.

Manual forward navigation covered all 24 views and returned to its start; reverse navigation wrapped from doll front to the bag's last view and back. Phone autoplay visited all 24 views in order, crossing all three product boundaries; desktop autoplay covered the bag and crossed back to the doll. Pause held its frame. All three original-photo dialogs loaded, the desktop bag original fit, and opening an original held the background beyond a rotation interval. Phone captures kept the complete product below the sticky header without horizontal overflow. The browser error log was empty. No generation or application-credit operation was performed.

The earlier browser blocker was a discovery/registration failure rather than a missing or disabled extension: Brave was running, its extension was enabled, and its native-host manifest was valid. A fresh Brave registration appeared during diagnostics and browser control worked. The exact cause of the earlier omission is unconfirmed; no browser/native-host settings were changed.
