"""Synthetic writes through the installed Vault route; requires an already owned dev session.

Create only randomly named fixture objects, remove them afterward, and print
sanitized checks. Never display or persist temporary browser capabilities.
"""

import importlib.util
import json
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    spec = importlib.util.spec_from_file_location(
        "launcher", ROOT / "scripts/infisical/local_vault.py"
    )
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    p, relay = launcher.load_profile()
    services = launcher.load_services()
    prefix = "users/vault-fixture/projects/" + secrets.token_hex(16)
    env = {
        "HOME": str(Path.home()),
        "PATH": "/usr/bin:/bin:/opt/homebrew/bin",
        "LC_ALL": "C",
    }
    command = launcher.session_command(p, relay, "services-check", services)
    command[command.index(str(ROOT / "scripts/infisical/local_services_check.mjs"))] = (
        str(ROOT / "scripts/infisical/fixtures/local_storage_probe.mjs")
    )
    offset = command.index("/usr/bin/env") + 1
    command[offset:offset] = ["FIXTURE_STORAGE_PREFIX=" + prefix]

    def run(mode):
        cmd = list(command)
        cmd[offset:offset] = ["FIXTURE_STORAGE_MODE=" + mode]
        result = subprocess.run(
            cmd, env=env, cwd=ROOT, capture_output=True, text=True, timeout=60
        )
        rows = [
            json.loads(line)
            for line in result.stdout.splitlines()
            if line.startswith('{"ok":')
        ]
        if result.returncode or len(rows) != 1 or not rows[0].get("ok"):
            raise ValueError("Installed storage fixture failed")
        return rows[0]

    complete = False
    try:
        data = run("roundtrip")
        body = b"Synthetic local Reshoot storage check. No personal data."
        request = urllib.request.Request(
            data["upload"]["url"],
            data=body,
            method="PUT",
            headers=data["upload"]["headers"],
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status != 200:
                raise ValueError()
        with urllib.request.urlopen(
            urllib.request.Request(
                data["read"],
                headers={"Cookie": "__session=synthetic-not-a-real-session"},
            ),
            timeout=10,
        ) as response:
            if response.read() != body:
                raise ValueError()
        try:
            urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as error:
            if error.code != 403:
                raise
            error.close()
        else:
            raise ValueError("Upload capability was reusable")
        complete = True
    finally:
        cleanup = run("cleanup")
    print(
        json.dumps(
            {
                "ok": complete,
                "installed_vault_route": True,
                "synthetic_roundtrip": complete,
                "server_put_head_get_stream": True,
                "browser_put_get": True,
                "browser_cookie_ignored": True,
                "upload_replay_denied": True,
                "fixture_objects_deleted": cleanup["deleted"],
                "provider_keys_read": False,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Installed storage check failed; credential diagnostics withheld",
                }
            )
        )
        sys.exit(1)
