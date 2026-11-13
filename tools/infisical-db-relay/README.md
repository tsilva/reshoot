# infisical-db-relay

A trusted local PostgreSQL relay for sandboxed apps using Infisical Agent Vault.
Version 0.1 supports loopback PostgreSQL only. It preserves interactive sessions,
transactions, savepoints, row locks and PostgreSQL type decoding through an HTTP
protocol. It is independently installable; Reshoot is its first consumer.

The app sends a public placeholder through Vault. Vault replaces its connection
header with the real connection URL. The relay validates the credential digest
and exact local database identity, then opens PostgreSQL connections in memory.
It never returns the connection URL, logs request bodies, fetches credentials or
writes credential caches. PostgreSQL stores the role's SCRAM password verifier;
Agent Vault stores the connection URL. The relay policy contains only metadata
and a digest. Keep it and the runtime in protected owner-only storage.

This is a trusted component outside the app sandbox. It does not isolate
full-access same-user host processes or a compromised machine. It does not use
the GCP token broker, support remote Neon endpoints, or replace upstream database
permissions. TLS is disabled only on the explicitly pinned loopback connection.

## Build and install

Run these package commands from `tools/infisical-db-relay` in the checkout.

Requires macOS, PostgreSQL 17 tools, Python 3.11, uv, the reviewed Infisical CLI
and a running Agent Vault proxy. Never install from an unreviewed consumer working tree.

The committed lock covers runtime and build dependencies. Use `--no-config` to
avoid unrelated global uv exceptions, and retain the seven-day release hold:

```sh
uv --no-config export --locked --exclude-newer '7 days' --only-group build \
  --no-emit-project --no-hashes --output-file /PRIVATE/BUILD/constraints.txt
uv --no-config build --exclude-newer '7 days' \
  --build-constraint /PRIVATE/BUILD/constraints.txt --out-dir /PRIVATE/BUILD/dist
uv --no-config export --locked --exclude-newer '7 days' --no-dev \
  --no-emit-project --output-file /PRIVATE/BUILD/requirements.txt
python3 -I scripts/install.py --wheel /PRIVATE/BUILD/dist/infisical_db_relay-0.1.0-py3-none-any.whl \
  --sha256 REVIEWED_WHEEL_SHA256 --requirements /PRIVATE/BUILD/requirements.txt \
  --uv /ABSOLUTE/TRUSTED/uv
```

The installer creates a new protected release and verifies wheel/dependency
hashes. It does not overwrite releases, start services, install launchd jobs,
change shell defaults, or provision credentials. Its runner uses isolated Python
without site startup hooks, then adds only the protected dependency directory.

## Tests before provisioning

Using the installed release's Python:

```sh
/PROTECTED/RELEASE/bin/python -I -m unittest discover -s tests -p 'test_*.py'
/PROTECTED/RELEASE/bin/python -I tests/integration.py
```

The integration test needs trusted Infisical administrative access to create and
remove a disposable fake-credential bundle. It starts and stops only its own
throwaway PostgreSQL instance. It exercises the actual Reshoot DB adapter,
interactive transactions and provider-cost code against synthetic AI responses;
no real model requests, production data, payments or media generation are used.
Evidence stays in the consumer's ignored `.internal/` directory.


Trusted provisioning supports an offline `--plan`. Creating or changing a deployment requires a separate administrative review before credentials or infrastructure change.
