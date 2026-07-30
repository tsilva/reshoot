# Reshoot design QA

## Target and implementation

- Visual source: `design/stitch-source/stitch_reshoot_ai_creative_studio/reshoot_choose_perspectives/screen.png`
- Implementation capture: `design/qa/local-perspectives-view.png`
- Combined comparison: `design/qa/stitch-vs-reshoot-mobile.png`
- Test viewport: 390 × 844 CSS pixels
- Compared state: product loaded with the perspective planner open

The Stitch export establishes the warm ivory surface, coral camera controls, dark ink typography, compact mobile hierarchy, and persistent generation action. Its static export does not rasterize the generated Three.js sphere. The implementation preserves that visual language and supplies the missing live orb, identity anchor, locked-camera pins, and shot-plan interactions.

## Interaction verification

- Initial upload state rendered at the mobile breakpoint.
- Sample product loading enabled the perspective workflow.
- The 3D sphere accepted a drag gesture.
- Locking after the drag added a fifth view at 18° orbit and 2° tilt.
- Removing perspectives updated the generation count.
- A live generation request reached Vercel AI Gateway and returned the account-level billing requirement cleanly.
- Reloading restored the in-progress shoot and shot state from IndexedDB.
- The new-shoot action displayed its destructive confirmation.
- Browser console checks returned no warnings or errors.

## Visual findings

- Typography, color, borders, imagery, and spacing are consistent with the Stitch system.
- The original product remains visually and semantically distinct from AI-generated references.
- Touch targets and primary actions are appropriately sized for mobile use.
- The implementation is intentionally more complete than the static Stitch capture where the 3D sphere was absent.

final result: passed
