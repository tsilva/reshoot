"""Schema-only setup must never execute app seed/backfill statements."""

import importlib.util
from pathlib import Path
import re
import shutil
import tempfile
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
ROOT = PACKAGE.parents[1]
spec = importlib.util.spec_from_file_location(
    "setup", PACKAGE / "scripts/provision_reshoot.py"
)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class BootstrapTests(unittest.TestCase):
    def test_reviewed_bootstrap_contains_only_ddl(self):
        statements = list(setup.schema_statements(ROOT))
        self.assertGreater(len(statements), 50)
        for statement in statements:
            clean = re.sub(r"(?m)^\s*--[^\n]*", "", statement).strip().upper()
            self.assertTrue(clean.startswith(("CREATE ", "ALTER ", "DROP ")))
        self.assertFalse(
            any('INSERT INTO "credit_packs"' in text for text in statements)
        )
        self.assertFalse(any("demo@reshoot.local" in text for text in statements))

    def test_changed_or_additional_migration_requires_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / "drizzle", root / "drizzle")
            first = sorted((root / "drizzle").glob("*.sql"))[0]
            first.write_text(
                first.read_text() + "\nINSERT INTO users VALUES ('synthetic');\n"
            )
            with self.assertRaises(ValueError):
                list(setup.schema_statements(root))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / "drizzle", root / "drizzle")
            (root / "drizzle/9999_unreviewed.sql").write_text("SELECT 1")
            with self.assertRaises(ValueError):
                list(setup.schema_statements(root))


if __name__ == "__main__":
    unittest.main()
