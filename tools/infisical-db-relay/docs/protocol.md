# Relay runtime and protocol

Run administrative commands below from the package directory.


`infisical-db-relay --profile /PROTECTED/relay.json` runs in the foreground.
The strict owner-only policy pins loopback ports, database, role, credential
digest and lifetimes. The consumer launcher starts the relay and its owned
PostgreSQL instance only for an opt-in session and stops its owned processes on
exit. It preserves existing processes and persistent local data.

Only JSON `POST /v1/db/open`, `/v1/db/query` and `/v1/db/close` are accepted.
Requests require the proxy-injected `Reshoot-Database-Connection` header and an
opaque client owner ID. Connection handles are random, bound to that owner, and
require strictly increasing sequence numbers. SQL is sent with bound parameters
through libpq; SQL placeholders are never rewritten. Results carry raw text and
field OIDs for the consumer's existing PostgreSQL parsers.

The relay bounds request/response sizes, concurrent handlers/connections, statement
and idle time, and connection lifetime. Closing/expiry rolls back unfinished
transactions. SQL failures return a SQLSTATE and generic error; provider details
are withheld. The Promise-only consumer adapter never retries ambiguous writes
and stops a failed transport session. A lost commit response can still mean the
commit succeeded: inspect application state before any separately approved retry.
Callback queries, COPY streams, notifications, cursors and general pg client
compatibility are outside this adapter's supported surface.

For reviewed source changes, `python3 -I scripts/approve_source.py` updates only
the protected consumer code digests. Review the diff first. It refuses an active
session and never changes service permissions, credential values or DB identity.
Normal app/check commands fail on changed pins rather than approving them.
