# Reshoot persistent-product design QA

## Stitch targets

- Project: `3558731671754376663`
- Design system: `d1b7688524cb4b23a60a581c874a6138` (Technical Curator)
- Projects mobile screen: `226f057aaa3646ffaed9d2368ec28779`
- Project Studio mobile screen: `1cbd6df05f1a47318b2d7c2b537b0e8f`
- Account & Credits mobile screen: `a42572af3cb9429aad1b46dc0cb6281d`
- Desktop Projects screen: `788a033ac63549fbabab298d3f5b0162`
- Desktop Account screen: `f8db3ca8fff943f19fe8c7b0a8023afc`

## Compared implementation states

- Demo sign-in entry with the seeded account, credit balance, disclosure, and a working Continue action.
- Signed-in user menu with identity, demo-session status, available credits, Account, Projects, and Exit actions.
- Projects library with a persisted, two-original product project.
- Project Studio Photos tab with primary and supporting reference controls.
- Project Studio Create tab with four selected presets and an exact 160-credit quote.
- Project Studio Review / History empty state.
- Account with available and held balances, dynamic shot estimate, all three packs, test-checkout labelling, and immutable grant activity.
- Mobile at 390 × 844 CSS pixels and desktop at 1280 × 900 CSS pixels.

## Visual comparison

The Stitch reference and implementation screenshots were placed side by side at the same 390 px width for Projects, Project Studio, Account, and the expanded signed-in control. The implementation preserves the source's warm ivory surface, deep-ink typography, coral actions, muted sage/lavender status colors, editorial headings, compact status pills, and restrained card geometry. Navigation was intentionally amended to Projects and Account only, as required by the product plan; Studio is entered through a project.

The implementation extends the initial Stitch concept with production states that were absent from the first mock: multi-reference management, exact quotes, held-credit language, no-charge checkout disclosure, immutable activity, loading skeletons, empty states, upload failures, insufficient-credit handling, batch progress, partial failures, and immutable versions.

## Interaction and responsive verification

- `/` resolves to the demo sign-in entry rather than bypassing the user boundary.
- Continue enters the persistent project workspace; Exit returns to the demo sign-in entry.
- The user control is visibly present and opens on mobile and desktop.
- The expanded panel exposes identity, session type, available credits, Account, and Projects.
- Projects, Account, Photos, Create, and Review / History navigation works.
- The library reports only finalized originals; abandoned pending uploads do not inflate counts.
- The primary reference is required and up to four supporting references can be selected.
- The exact quote shows each shot's reference count and credits before confirmation.
- Generation confirmation was intentionally not triggered during design QA.
- Account test checkout was verified earlier with one idempotent Studio-pack grant.
- Mobile and desktop have no horizontal overflow.
- The sign-in page and user panel were verified at 390 × 844 and 1280 × 900.
- Browser console verification returned no warnings or errors.
- Mobile sticky actions remain reachable while scrolling.
- Inputs, buttons, and links have visible focus treatment.
- The public DOM, client bundles, API types, filenames, and README contain no image-service or model names.

final result: passed
