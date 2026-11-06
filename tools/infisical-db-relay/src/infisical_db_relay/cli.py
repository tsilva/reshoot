"""Foreground-only relay; no credentials, database creation or global configuration."""

import argparse
import json
import os
from pathlib import Path
import re
import signal
import stat
import threading

from .relay import Relay, serve


def load_policy(path):
    path = Path(path)
    info = path.lstat()
    if (
        path.resolve() != path
        or not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise ValueError("Expected an owner-only canonical policy file")
    policy = json.loads(path.read_text())
    fields = {
        "version",
        "database_port",
        "listen_port",
        "database",
        "role",
        "dsn_sha256",
        "idle_seconds",
        "lifetime_seconds",
    }
    if (
        set(policy) != fields
        or type(policy["version"]) is not int
        or policy["version"] != 1
    ):
        raise ValueError("Unsupported relay policy")
    for k in ("database_port", "listen_port"):
        if type(policy[k]) is not int or not 1024 <= policy[k] <= 65535:
            raise ValueError("Invalid local port")
    for k in ("database", "role"):
        if not isinstance(policy[k], str) or not re.fullmatch(
            "[a-z][a-z0-9_]{0,62}", policy[k]
        ):
            raise ValueError("Invalid local database identity")
    if not re.fullmatch("[a-f0-9]{64}", policy["dsn_sha256"]):
        raise ValueError("Invalid credential digest")
    for k, low, high in [("idle_seconds", 1, 60), ("lifetime_seconds", 5, 600)]:
        if type(policy[k]) is not int or not low <= policy[k] <= high:
            raise ValueError("Invalid lifetime")
    return policy


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--profile", type=Path, required=True)
    args = parser.parse_args()
    relay = server = None
    try:
        policy = load_policy(args.profile)
        relay = Relay(policy)
        server = serve(relay)
        stopped = threading.Event()
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, lambda *_: stopped.set())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(
            json.dumps(
                {"ready": True, "host": "127.0.0.1", "port": policy["listen_port"]}
            ),
            flush=True,
        )
        stopped.wait()
        server.shutdown()
        thread.join(timeout=5)
        return 0
    except Exception:
        print(
            json.dumps(
                {"ready": False, "reason": "Relay failed; diagnostics withheld"}
            ),
            flush=True,
        )
        return 1
    finally:
        if server:
            server.server_close()
        if relay:
            relay.stop()


if __name__ == "__main__":
    raise SystemExit(main())
