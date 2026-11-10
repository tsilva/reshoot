"""Trusted local package installation. Does not provision credentials or start services."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = Path.home() / ".config/infisical/database-relay"
PYTHON = (
    Path.home()
    / ".local/share/uv/python/cpython-3.11.15-macos-aarch64-none/bin/python3.11"
)


def run(args):
    result = subprocess.run(
        args,
        cwd=ROOT,
        env={"HOME": str(Path.home()), "PATH": "/opt/homebrew/bin:/usr/bin:/bin"},
        capture_output=True,
    )
    if result.returncode:
        raise ValueError("Package operation failed; diagnostic output withheld")
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--requirements", type=Path, required=True)
    parser.add_argument("--uv", type=Path, required=True)
    args = parser.parse_args()
    wheel = args.wheel.resolve(strict=True)
    if hashlib.sha256(
        wheel.read_bytes()
    ).hexdigest() != args.sha256 or not wheel.name.startswith(
        "infisical_db_relay-0.1.0-"
    ):
        raise ValueError("Reviewed package digest does not match")
    release = BASE / "releases" / ("0.1.0-" + args.sha256[:16])
    if release.exists():
        raise ValueError("Release already exists; do not overwrite it")
    os.umask(0o077)
    release.mkdir(parents=True, mode=0o700)
    python = release / "bin/python"
    run([str(args.uv), "--no-config", "venv", "--python", str(PYTHON), str(release)])
    run(
        [
            str(args.uv),
            "--no-config",
            "pip",
            "sync",
            "--python",
            str(python),
            "--require-hashes",
            str(args.requirements.resolve()),
        ]
    )
    run(
        [
            str(args.uv),
            "--no-config",
            "pip",
            "install",
            "--python",
            str(python),
            "--no-deps",
            str(wheel),
        ]
    )
    runner = release / "run.py"
    runner.write_text(
        "import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).parent / 'lib/python3.11/site-packages'))\nfrom infisical_db_relay.cli import main\nraise SystemExit(main())\n"
    )
    manifest = {
        "version": 1,
        "wheel_sha256": args.sha256,
        "python": str(python),
        "runner": str(runner),
        "requirements_sha256": hashlib.sha256(
            args.requirements.read_bytes()
        ).hexdigest(),
    }
    (release / "install.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"ok": True, "release": str(release), "services_started": False}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            json.dumps(
                {"ok": False, "reason": "Installation failed; diagnostics withheld"}
            )
        )
        sys.exit(1)
