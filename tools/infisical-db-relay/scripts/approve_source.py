"""Trusted metadata-only approval after reviewing local launcher/source changes."""

import fcntl
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[3]
BASE = Path.home() / ".config/infisical/database-relay/reshoot"


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument(
        "--storage-runtime",
        action="store_true",
        help="Also promote this explicitly reviewed local storage relay source",
    )
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location(
        "local", ROOT / "scripts/infisical/local_vault.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    path = BASE / "app.json"
    module.regular(path)
    p = json.loads(path.read_text())
    if (
        p["repo_path"] != str(ROOT)
        or p["project_id"] != module.PROJECT
        or p["bundle"] != "local-reshoot-development"
    ):
        raise ValueError()
    if (
        hashlib.sha256((BASE / "relay.json").read_bytes()).hexdigest()
        != p["relay_policy_sha256"]
    ):
        raise ValueError()
    if (
        hashlib.sha256((Path(p["release"]) / "install.json").read_bytes()).hexdigest()
        != p["release_manifest_sha256"]
    ):
        raise ValueError()
    with (BASE / "session.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.storage_runtime:
            profile, _storage = module.load_services()
            source = ROOT / "scripts/infisical/local_storage_relay.py"
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            program = BASE / ("storage-" + digest[:16] + ".py")
            if not program.exists():
                fd = os.open(program, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(fd, "wb") as f:
                    f.write(source.read_bytes())
            module.regular(program)
            if hashlib.sha256(program.read_bytes()).hexdigest() != digest:
                raise ValueError("Installed storage artifact mismatch")
            profile["storage_program"] = str(program)
            profile["storage_program_sha256"] = digest
            fd, name = tempfile.mkstemp(prefix=".storage-review-", dir=BASE)
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(profile, f, indent=2)
                    f.write("\n")
                os.replace(name, BASE / "services.json")
            finally:
                if Path(name).exists():
                    Path(name).unlink()
        pins = {
            f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest()
            for f in sorted(module.source_files())
        }
        changed = [f for f, h in pins.items() if p["code_sha256"].get(f) != h]
        p["code_sha256"] = pins
        fd, name = tempfile.mkstemp(prefix=".review-", dir=BASE)
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(p, f, indent=2)
                f.write("\n")
            os.replace(name, path)
        finally:
            if Path(name).exists():
                Path(name).unlink()
    module.load_profile()
    print(
        json.dumps(
            {"ok": True, "reviewed_files": changed, "service_scope_changed": False}
        )
    )


if __name__ == "__main__":
    main()
