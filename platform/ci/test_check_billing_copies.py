"""Tests for check_billing_copies.py (cd platform/ci && python3 -m unittest test_check_billing_copies)."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_billing_copies as cbc  # noqa: E402


class DriftTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.dirs = []
        for v in ("a", "b"):
            d = root / "ventures" / v / "packages" / "billing" / "src"
            d.mkdir(parents=True)
            (d / "crypto.ts").write_text("export const x = 1;\n")
            (d / "index.ts").write_text(f"export * from '{v}';\n")
            (d / "crypto.test.ts").write_text("// test\n")
            self.dirs.append(d)
        self._repo = cbc.REPO
        cbc.REPO = root

    def tearDown(self):
        cbc.REPO = self._repo
        self.tmp.cleanup()

    def test_identical_copies_pass_and_index_may_differ(self):
        self.assertEqual(cbc.drift(self.dirs), ([], []))

    def test_source_drift_fails(self):
        (self.dirs[1] / "crypto.ts").write_text("export const x = 2;\n")
        errors, _ = cbc.drift(self.dirs)
        self.assertEqual(len(errors), 1)
        self.assertIn("crypto.ts", errors[0])

    def test_test_drift_is_a_note(self):
        (self.dirs[1] / "crypto.test.ts").write_text("// stronger test\n")
        errors, notes = cbc.drift(self.dirs)
        self.assertEqual(errors, [])
        self.assertEqual(len(notes), 1)

    def test_file_in_one_copy_only_is_ignored(self):
        (self.dirs[0] / "only-here.ts").write_text("x\n")
        self.assertEqual(cbc.drift(self.dirs), ([], []))

    def test_main_tree_is_green(self):
        cbc.REPO = self._repo
        errors, _ = cbc.drift(cbc.copies(self._repo))
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
