"""Fixed, credential-free source identity for explicit trusted administration."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'cdb4be1b-c53c-4b18-87eb-6f90aae2b661'
PREFIX = Path.home() / ".config/infisical"
BASE = PREFIX / "database-relay/reshoot"
FINGERPRINT = "SHA256:37:B2:E0:81:45:EC:C0:58:46:2E:D1:2F:E1:2B:E6:AE:2B:78:B1:B3:F0:21:CD:8F:EC:54:CC:30:2D:36:9E:37"


def source_files():
    raise ValueError("Runbox profile publication requires explicit trusted metadata review")


def reviewed_identity(root=ROOT, identity=None):
    expected = {
        "workspaceId": PROJECT,
        "defaultEnvironment": "dev",
        "gitBranchToEnvironmentMapping": None,
        "domain": "https://app.infisical.com",
    }
    if identity is not None and (type(identity) is not dict or identity != expected):
        raise ValueError("Trusted Development source differs from the fixed administration identity")
    return expected


def publication_plan(root=ROOT):
    reviewed_identity(root)
    return {
        "ok": True, "offline": True, "source_verified": True,
        "credentials_read": False, "changes_made": False,
        "publication_requires_trusted_runbox_review": True,
    }
