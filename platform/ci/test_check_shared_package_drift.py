import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_shared_package_drift as c  # noqa: E402


def write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


class DriftTest(unittest.TestCase):
    def test_flags_a_fix_made_in_one_copy_only(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            write(root, "ventures/a/packages/qbo-sync/src/money.ts", "fixed")
            write(root, "ventures/b/packages/qbo-sync/src/money.ts", "buggy")
            write(root, "ventures/a/packages/qbo-sync/src/only-a.ts", "x")
            problems = c.drift(root, known={})
            self.assertEqual(len(problems), 1)
            self.assertIn("qbo-sync/src/money.ts", problems[0])

    def test_identical_copies_and_known_divergence_pass(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            write(root, "ventures/a/packages/billing/src/grace.ts", "same")
            write(root, "ventures/b/packages/billing/src/grace.ts", "same")
            write(root, "ventures/a/packages/billing/src/index.ts", "// @a/billing")
            write(root, "ventures/b/packages/billing/src/index.ts", "// @b/billing")
            self.assertEqual(c.drift(root, known={"billing/src/index.ts": "names"}), [])

    def test_stale_allowlist_entry_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            write(root, "ventures/a/packages/billing/src/index.ts", "same")
            write(root, "ventures/b/packages/billing/src/index.ts", "same")
            problems = c.drift(root, known={"billing/src/index.ts": "names"})
            self.assertEqual(len(problems), 1)
            self.assertIn("remove the entry", problems[0])

    def test_repository_is_green(self):
        self.assertEqual(c.drift(), [])


if __name__ == "__main__":
    unittest.main()
