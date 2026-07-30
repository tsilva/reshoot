# Reshoot design QA

## Target and implementation

- Stitch target: `design/stitch-source/iterations/2026-07-30/perspectives-production.png`
- Mobile implementation: `design/qa/2026-07-30/perspectives-mobile.png`
- Desktop implementation: `design/qa/2026-07-30/perspectives-desktop.png`
- Combined comparison: `design/qa/2026-07-30/stitch-vs-implementation.png`
- Responsive target: 390 × 844 CSS pixels
- Compared state: sample product loaded with the four-angle starter set selected

The implementation carries the Stitch iteration into Reshoot's existing design
system: a guided original-photo step, a compact identity reference, four
explicit starter views, an optional custom-angle disclosure, and a persistent
generation action. The current-step heading receives programmatic focus without
leaving a visual outline on a non-interactive heading.

## Interaction verification

- Loading the sample product enables the move to Perspectives.
- Moving from a scrolled upload screen resets the next step to `scrollY = 0`.
- The `Choose perspectives` heading receives focus after the step change.
- All four recommended presets begin selected.
- Toggling Front updates the action from 4 shots to 3, and selecting it again
  restores the four-shot plan.
- The completed Original step is navigable and restores upload-step focus.
- The optional custom-angle panel exposes labelled keyboard controls.
- Rotating right updates the custom camera from 18° to 33° orbit.
- The paid Generate action was intentionally not triggered during QA.
- Browser console checks returned no warnings or errors.

## Visual and responsive findings

- Mobile and desktop layouts have no horizontal overflow.
- The mobile generation action remains visible and its button is 46 px tall.
- The original reference wraps cleanly instead of truncating.
- Preset cards retain clear selected states, labels, and angle metadata.
- The implementation keeps Reshoot's header and progress rail while matching
  the Stitch screen's hierarchy, warm palette, coral selection treatment, and
  compact task-focused flow.

final result: passed
