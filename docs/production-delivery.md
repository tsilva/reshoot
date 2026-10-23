# Production delivery

Push to `main` triggers `.github/workflows/production-delivery.yml`. It tests delivery boundaries and waits for the same commit’s CI before retrieving secrets. Then it syncs the fixed production allowlist in `.github/scripts/production-delivery.json`, deploys that exact commit, and verifies the resulting deployment. Vercel’s automatic Git deployments are disabled so they cannot race the sync.

Infisical remains the source of application secrets. Local development uses the existing human CLI login and Development environment. Production uses one shared GitHub reader with Viewer access to the assigned production vaults. GitHub OIDC issues a 15-minute read-only session only for approved repositories on main, in the Production environment and delivery workflow. Each repository’s script pins its own source vault and key allowlist; the shared identity itself can read all assigned production vaults. The provider credential is a project-scoped `VERCEL_TOKEN` stored in the repository’s GitHub Production environment. No general CLI login is copied into GitHub.

The workflow does not run on pull requests or forks, export `.env` files, upload secret artifacts, delete secret variables, or change preview/development variables. All required source keys and destination targets are checked before writes. Failed CI or sync prevents deployment. Existing production remains live on failure.

Production secret creates, updates, and deletes in Infisical’s `prod` environment at `/` notify the signed webhook receiver at `https://modelarchviz.tsilva.eu/api/infisical-webhook`. The receiver dispatches this repository’s **Production delivery** workflow on `main`; its existing CI, OIDC, allowlist, sync, and deployment checks still apply. Development and other folders do not trigger delivery. No secret values are sent in webhook notifications.

Use **Actions → Production delivery → Run workflow → main** to recover after fixing a failed webhook or workflow. There is no polling schedule. GitHub dispatch failures receive short bounded retries; failed workflows need a fresh run after the cause is fixed. Deployment tokens expire after one year and need rotation before expiry.

Native Infisical syncs are disabled after this workflow has successfully replaced them. Updating a deployment credential in GitHub does not replace application keys in Infisical.

## R2 environments

Configured and verified on 2026-10-14:

| Environment | Private bucket | Cloudflare account token | Infisical source |
| --- | --- | --- | --- |
| Local development / Vercel Preview | `reshoot-development` | `reshoot-development-20261014` | Linked `reshoot` project, Development `/` |
| Production | `reshoot` | `reshoot-production-20261014` | `reshoot-production`, Production `/` |

Both tokens permit Object Read & Write only on their named bucket and expire
on October 14, 2027. Rotate before expiry. Development's bucket allows signed
browser requests from any origin to support automatic local ports; its public
development URL and custom domains remain disabled. CORS does not grant object
access: private files still require a valid signed URL. Production CORS and
existing object keys were retained.

Preview uses the working Development database source so its asset references
match the Development bucket. Existing Development-referenced objects were
copied and checked before switching; Production objects were not moved.

For rotation, create an overlapping replacement restricted to the same bucket,
verify a synthetic upload/read/delete and denial on the other bucket, update
the corresponding Infisical source and Vercel environment, and redeploy. Verify
browser upload, finalized preview, and existing object access before revoking
the old token. Allow outstanding signed URLs to drain before revocation.
Historical deployments freeze credentials: after revocation, rebuild an older
application commit with current environment values before rolling back.

Production and Preview call OpenRouter directly with their own server-only `OPENROUTER_API_KEY`. Production delivery reads this key only from this app’s isolated production Infisical project; it never copies a development key. Missing production keys fail closed. AgentBridge is used only for development. The shared text-routing default is `deepseek/deepseek-v4.1-flash-1017`. Image generation retains the supported image models; DeepSeek is not an image generator.

Secret synchronization updates an existing Production variable by its exact Vercel ID, preserving separately configured Preview rows. New variables are created only when Production has no matching row; duplicate or combined targets still stop delivery.

Production values must differ from Preview and Development under the Vercel isolation policy. Delivery reports `production-secret-reused` without printing the provider response. Reshoot uses the separate `reshoot-production-build` Sentry organization token with `org:ci` scope for source-map uploads and releases; keep it only in the production vault. Rotate the source token rather than weakening isolation or editing Preview.

Production delivery classifies public settings through the pinned `configNames` list; all other allowlisted values remain write-only Secrets. Vercel’s Require Separate Values policy stays enabled: real Production secrets must differ from non-production values. Existing variables are updated by their exact Production IDs. A legacy Secret explicitly listed as public configuration is replaced only in Production because Vercel cannot convert it to Config in place; Preview and Development rows are preserved. Provider responses and credential values are never logged. A failed sync holds deployment; rerun delivery after fixing the named key at its source.

A READY build is not a completed release until Vercel confirms Production domain
assignment. Required integration checks, including Clerk DNS verification,
remain enforced. The workflow waits for assignment, fails on alias errors or
timeout, and rechecks the current main commit before reporting `Production
READY`. Never bypass a failed integration check to make delivery green.
