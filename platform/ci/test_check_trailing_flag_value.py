"""Tests for check_trailing_flag_value.py (red team 2026-11-20)."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_trailing_flag_value as c  # noqa: E402

UNGUARDED = "for (let i = 0; i < argv.length; i++) { if (argv[i] === '--manifest') args.manifest = argv[++i]; }\n"
GUARDED = (
    "for (let i = 0; i < argv.length; i++) { if (argv[i] === '--manifest') { const v = argv[++i];\n"
    "  if (v === undefined) throw new Error('--manifest needs a file path'); args.manifest = v; } }\n"
)


class TrailingFlagTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.baseline = self.root / "baseline.txt"

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def run_check(self):
        return c.main(["--root", str(self.root), "--baseline", str(self.baseline)])

    def test_new_unguarded_cli_fails(self):
        self.write("ventures/x/check.mjs", UNGUARDED)
        self.assertEqual(c.unguarded(self.root), ["ventures/x/check.mjs"])
        self.assertEqual(self.run_check(), 1)

    def test_guarded_cli_passes(self):
        self.write("ventures/x/check.mjs", GUARDED)
        self.assertEqual(c.unguarded(self.root), [])
        self.assertEqual(self.run_check(), 0)

    def test_baselined_file_passes_and_tests_are_skipped(self):
        self.write("ventures/x/check.mjs", UNGUARDED)
        self.write("ventures/x/check.test.mjs", UNGUARDED)
        self.write("ventures/x/node_modules/dep/cli.js", UNGUARDED)
        self.baseline.write_text("# header\nventures/x/check.mjs\n", encoding="utf-8")
        self.assertEqual(self.run_check(), 0)

    def test_the_pre_fix_obsidian_cli_is_flagged_and_the_fixed_one_is_not(self):
        fixed = (c.ROOT / "ventures/obsidian-plugin-review-check/check.mjs").read_text(encoding="utf-8")
        self.assertRegex(fixed, c.GUARDS)
        self.write("ventures/o/check.mjs", "else if (argv[i] === '--manifest') args.manifest = argv[++i];\n")
        self.assertEqual(c.unguarded(self.root), ["ventures/o/check.mjs"])

    def test_an_empty_root_is_refused(self):
        self.assertEqual(self.run_check(), 2)

    def test_repository_is_green(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
