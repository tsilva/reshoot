# Reshoot single-page studio QA

## Current experience — 2026-10-21

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
