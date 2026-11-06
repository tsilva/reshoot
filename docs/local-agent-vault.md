# Local development through Agent Vault


Run app commands from the repository root on a trusted machine with the reviewed
relay/profile installed:

```sh
pnpm db:check-local:vault
pnpm services:check-local:vault
pnpm dev:vault
```

The database check is read-only: it verifies the isolated database identity,
restricted role and upstream AgentBridge authentication. The services check reads
Clerk's public signing keys through Vault and verifies the local storage route;
it reports whether Clerk is configured and never signs in a user or writes files.
The dev command uses `--port auto`
and prints its actual loopback URL. It starts only its owned local PostgreSQL
instance and foreground relay, then runs Next in the macOS sandbox. Stopping the
launcher stops its owned processes and preserves the local database. Vault sessions expire after 30 minutes and fail closed; stop/relaunch to renew.
A running session holds an exclusive local lock; it does not restart existing servers.

Flow: local Reshoot server → Agent Vault proxy → trusted HTTP relay → separate
local PostgreSQL. The server receives `reshoot_database_public_placeholder`;
Vault attaches the connection URL only on the relay's three POST routes. The
relay preserves interactive transactions, rollback and row locking. It validates
the exact credential digest/database identity and does not return credentials.
Database and AI errors are sanitized; ambiguous writes are never retried by the
transport. The trusted relay and full-access host processes are outside the
application sandbox.

Service mapping: native project `cdb4be1b-c53c-4b18-87eb-6f90aae2b661`, Development,
reserved folder `/agents/database`, Agent Vault bundle `local-reshoot-development`.
This credential is managed directly in Agent Vault; no source folder is exported.
Its database service targets only the protected profile's loopback relay port and
`POST /v1/db/open`, `/v1/db/query`, `/v1/db/close`. Its AI services permit the
existing loopback gateway's catalog/chat/image paths and a separate GET-only
upstream-key check. No upstream AI key is copied into this application.

The owner-only `database-relay/reshoot/app.json` profile under the Infisical
configuration directory pins the native identity, relay release/policy, Node,
compiler, CA, source and schema. Scope/command overrides and changed pins fail.
Use the package's explicit trusted source-approval command only after review;
ordinary launches never retrieve or approve credentials. See
[the relay package](../tools/infisical-db-relay/README.md) for installation,
fake-first tests, schema bootstrap, provisioning and protocol limits.

The database is `reshoot_agent_vault_dev`, accessed as
`reshoot_agent_vault_app`, in a separate local cluster. It contains the reviewed
schema without demo seeds, prices, users, credits or historical backfills. The
app role can read/write application tables and use sequences, but cannot create
databases/roles/schemas, own tables or bypass RLS. No Neon or production database
is copied or contacted. The existing read-only migration-auditor route is unchanged.

The new transport is selected only by this opt-in launcher. Existing `dev`, build,
start, model defaults, production delivery and Sentry uploads are unchanged.
Next's output, generated type declarations and workflow state use local generated
namespaces; the normal tsconfig and next-env declarations remain unchanged. The
sandbox permits the pinned compiler and Workflow's already ignored generated
route directory, while blocking credential files, Keychain and direct DB access.

`GET /api/internal/local-database` returns only readiness on loopback in this
explicit Development mode; it returns 404 under ordinary/hosted defaults and
never returns rows, identities or credentials. Fake-key transaction/accounting
checks and an actual local readiness round trip are verified. Realtime, payments
and paid inference still require separate compatible routes and authorization.
No auth bypass or dummy R2 credentials are supplied. Development uses fallback fonts when Google
Fonts is blocked, and file watchers/cache snapshots can warn about protected
paths. The opt-in Next configuration preserves loopback URLs for Clerk middleware
and disables development logging that could expose session URLs. These changes
do not broaden network or credential access.

## Local sign-in and storage

The opt-in launcher also supports a reviewed `services.json` profile beside
`app.json`. It contains only public Clerk instance metadata, a public signing-key
fingerprint, storage policy/runtime digests and service IDs. Missing Clerk setup
is reported explicitly; it does not enable demo authentication. Changed or
invalid bindings fail without a credential or direct-network fallback.

| Service | Vault service in `local-reshoot-development` | Permitted transport |
| --- | --- | --- |
| Clerk Development | `reshoot-local-clerk` | GET on the protected relay's `localhost` alias: `/v1/jwks`, one `/v1/users/user_ID`, and `/v1/clients/handshake_payload?nonce=...` |
| Local object storage | `reshoot-local-storage` | POST on the protected relay's `127.0.0.1` address: `/v1/storage/check`, `sign-upload`, `sign-read`, `head`, `get`, `put`, `delete` |

These are direct Agent Vault bindings, not Secret Manager folders to export.
Clerk's existing Development instance supplies browser sign-in. The browser uses
its public publishable key and normal user session cookies; the server receives
only `sk_test_reshoot_vault_public_placeholder`. Vault attaches the backend key
to the trusted relay, which calls Clerk over verified HTTPS. It validates the
instance's public signing key, allows only the exact SDK reads above, and returns
only the user identity/name/email fields used by the app. User lists, user writes,
OAuth access-token endpoints and arbitrary private metadata are unavailable.
Production and Preview retain the native Clerk/Vercel integration.

Storage uses a separate owner-only folder in the protected local profile, not R2.
No R2 access key or signing secret enters the app. The server uses
`reshoot_storage_public_placeholder`; Vault authorizes its requests to the relay.
Existing storage-adapter calls use this transport only in the explicit local
mode. Objects preserve their logical per-user keys and are stored atomically
under hashed filenames, with SHA-256 and length metadata.

Upload/download URLs are random capabilities for one object and operation, valid
for at most ten minutes and only while the relay is running. Browser transfers
use these URLs directly; they do not expose the Vault session or storage token.
An upload URL is consumed after one successful checksum-verified upload. Browser
uploads are capped at 20 MiB; server objects at 512 MiB. Large objects are buffered
on writes, so this development relay is not a production storage service. Browser
cookies on image requests are ignored; they never authorize storage access. CORS
permits only loopback HTTP origins. Files survive launcher shutdown; capabilities
do not. The authenticated app still enforces project ownership before minting URLs.

The relay runs from an explicitly reviewed copy outside the app sandbox, using
the protected Python runtime. Its upstream key stays in request memory and Vault;
it never writes credentials or logs capability URLs. It exposes no arbitrary
upstream host or filesystem path. The sandboxed app cannot read the object folder
or connect directly to the relay. Full-access same-user host processes remain
outside this boundary.

For first setup, run the synthetic tests before trusted administration:

```sh
python3 -I scripts/infisical/test_local_storage.py
python3 -I scripts/infisical/test_local_services_native.py
python3 -I scripts/infisical/provision_local_services.py --install --storage-only
```

The native test creates/deletes only a disposable bundle, a temporary local
object store and fake Clerk provider. It uses the installed Clerk SDK and actual
app storage adapter; it neither reads source keys nor contacts Clerk or R2.

Create a dedicated Development backend key in the reviewed Reshoot Clerk
instance, then use trusted clipboard-to-Vault setup:

```sh
python3 -I scripts/infisical/connect_local_clerk.py \
  --from-clipboard --publishable-key REVIEWED_PUBLIC_DEVELOPMENT_KEY
python3 -I tools/infisical-db-relay/scripts/approve_source.py --storage-runtime
pnpm services:check-local:vault
```

The setup transfers the copied key directly into Vault without printing or saving
it to a file, then clears that clipboard value if it is still unchanged. It refuses
an already connected profile. Rotation needs separate trusted review and Vault
credential replacement; ordinary launchers never retrieve or refresh the key.
Source approval promotes only the reviewed storage relay copy and metadata pins;
it does not rotate credentials, start services or change default commands.
