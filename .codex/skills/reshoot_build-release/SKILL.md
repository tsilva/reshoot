---
name: reshoot_build-release
description: Build, publish, and verify Reshoot through its existing GitHub Actions and Vercel delivery workflow. Use for local release builds, authorized publication, or deployment verification.
---

# Build Release

Use this project adapter with the installed `$private-skills_release-workflow`.
Read [AGENTS.md](../../../AGENTS.md), [production delivery](../../../docs/production-delivery.md),
and the current [CI](../../../.github/workflows/ci.yml) and
[Production delivery](../../../.github/workflows/production-delivery.yml) workflows.
These maintained sources own commands, credential routes, workflow pins, and targets;
do not copy past deployment IDs, project mappings, or secret values into this skill.

## Select the requested outcome

- **Build:** validate local changes and produce the application build without a push.
- **Publish:** review the authorized candidate, commit and push it, monitor delivery,
  and verify the exact live deployment. Include all pending repository changes only
  when the user requests that scope; preserve unrelated edits for scoped requests.
- **Verify/status:** inspect the requested commit and live behavior without creating
  commits, dispatching delivery, or regenerating product images.

A bare invocation prepares a local build. Creating or editing this skill does not
authorize publication. Reshoot releases are identified by their full Git commit SHA;
this deployment contract requires no package-version bump, tag, GitHub Release, or
release notes. Requested outbound comments or announcements retain draft approval.

## Prepare the candidate

1. Resolve the actual Git repository, current branch, upstream, and pending changes.
   Stay on the current branch. At the start of coding work, synchronize once with
   the configured upstream using `git pull --no-rebase`, preserving local work.
   Use GitHub HTTPS with `gh auth git-credential`; preserve saved remotes and signing.
   Stop on failed synchronization or unresolved conflicts.
2. Authorized uncommitted changes are allowed as the release candidate. Review every
   included file, including untracked files, and keep ignored private evidence out
   of commits. Production delivery requires `main`; on another branch, report that
   limitation without switching branches or changing the deployment trigger.
3. Check repository access metadata before credential-bearing service commands.
   Follow the reviewed project launchers and proxy routes; do not fetch raw keys,
   export environments, or substitute a development credential for Production.

## Validate

Read [package.json](../../../package.json) and CI for the current checks. For
application changes, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
Use the inert build environment declared in CI for a credential-free local build;
do not load live secrets merely to build. Install dependencies only if necessary,
with the frozen lockfile and existing package-age/source protections intact.
Run `pnpm test:secrets` when the credential-launcher path changes.

For instructions or documentation alone, validate the edited files and references;
the publication workflow still performs the full application checks. A focused
rerun can diagnose a local timeout, but retain the initial result and require the
full exact-commit CI suite to pass. Do not weaken tests or security gates to publish.
Revalidate affected checks if the candidate changes after validation.

## Publish through the existing pipeline

Use the installed `$private-skills_push` for every authorized push, including its
destination checks and published-default-branch README description reconciliation.
Stage the reviewed scope, inspect the staged diff, commit normally, and record the
full source SHA. Do not disable signing, force-push, or broaden scope to resolve a
failure. Report push and description outcomes separately; a description failure
does not justify repeating a successful push.

A push to `main` triggers the pinned trusted Production delivery workflow. It waits
for the matching CI, synchronizes the fixed Production allowlist, and deploys that
exact commit. Keep automatic Vercel Git deployments disabled. Do not replace this
path with a direct Vercel deployment, manually copied secrets, or modified gates.

Find Actions runs using the actual destination repository and full SHA, for example:

```sh
gh run list --repo OWNER/REPO --commit FULL_SHA --limit 8 \
  --json databaseId,workflowName,status,conclusion,url
```

Monitor the matching CI, secret scanning, dependency review, CodeQL, and Production
delivery runs, checking current workflows for changes. Keep waits bounded and
provide progress updates. Inspect the exact failed gate before recovery; use the
documented trusted workflow recovery after resolving its prerequisite, and never
loop failed runs or bypass authentication, isolation, integration, or alias checks.

## Verify live delivery

Prefer the Vercel connector to resolve the deployment for the full source SHA.
Require `meta.githubCommitSha` to match, `readyState` to be `READY`, the target to
be Production, and the intended production domain to appear in its assigned
aliases. Workflow acceptance or a green build alone does not prove live delivery.

Verify the changed user flow against that deployment using
[the existing testing guidance](../../../docs/testing.md). Use the configured Brave
browser runtime for browser QA and desktop/phone checks when UI changes warrant
them. If browser access fails, report the gap without substituting another browser
or claiming an API check proves browser behavior.

- For ZIP changes, retrieve an archive through the application endpoint and inspect
  its download filename, folder layout, unique entry names, expected image count,
  CRCs, and file signatures. Distinguish an HTTP artifact check from a completed
  native-browser download.
- For generation setup or progress, use fixtures/mocked jobs and existing completed
  shoots. Do not invoke paid generation, grant credits, run migrations or retention
  cleanup, or delete existing projects merely to verify a release. Exercise deletion
  and storage failures with the existing mocked regression tests.
- If sample photography changed, use
  [$reshoot_generate-rotation-images](../reshoot_generate-rotation-images/SKILL.md)
  for its required live visual review; HTTP success does not certify rotations.

Keep any session evidence in ignored `.internal/` locations after verifying their
exclusion and that no such files are tracked, as required by `AGENTS.md`.

## Complete

Recheck the worktree, published branch, and upstream after delivery; fetch refs if
the push helper left remote-tracking refs stale. Identify any new or remaining
edits without silently including them in a scoped release. If main advanced,
do not describe an older deployment as the latest verified candidate.

Report the live URL, source commit, relevant checks, exact-commit READY and domain
assignment, smoke-check results or gaps, remaining local changes, and the separate
push/description outcomes. Claim completion only for the verified requested scope.
