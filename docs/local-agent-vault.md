# Local development through Agent Vault


Run app commands from the repository root on a trusted machine with the reviewed
relay/profile installed:

```sh
pnpm db:check-local:vault
pnpm dev:vault
```

The check is read-only: it verifies the isolated database identity, restricted
role and upstream AgentBridge authentication. The dev command uses `--port auto`
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
checks and an actual local readiness round trip are verified. This does not
configure sign-in, object storage, signing secrets, Realtime, payments or paid
inference. Their existing requirements remain in force; no auth bypass or dummy
storage credentials are supplied. Development uses fallback fonts when Google
Fonts is blocked, and file watchers/cache snapshots can warn about protected
paths. These limitations do not broaden network or credential access.
