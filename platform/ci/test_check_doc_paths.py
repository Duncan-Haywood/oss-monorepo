import tempfile
import unittest
from pathlib import Path

import check_doc_paths as c


class PathsIn(unittest.TestCase):
    def found(self, text):
        return [p for _, p in c.paths_in(text)]

    def test_picks_repo_paths_only(self):
        self.assertEqual(self.found("see `platform/ci/x.py`, `ls -l` and `foo/bar`"),
                         ["platform/ci/x.py"])

    def test_skips_placeholders_numbers_and_fences(self):
        t = "`portfolio/ledger/YYYY-MM.yaml` `ventures/<slug>/a` `research/0` `prompts/*.md`\n```\n`platform/gone.py`\n```\n"
        self.assertEqual(self.found(t), [])

    def test_trailing_punctuation_stripped(self):
        self.assertEqual(self.found("`platform/ci/x.py.`"), ["platform/ci/x.py"])


class Stale(unittest.TestCase):
    def test_flags_missing_only(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform").mkdir()
            (root / "platform" / "real.py").write_text("")
            (root / "A.md").write_text("`platform/real.py`\n`platform/gone.py`\n")
            self.assertEqual(c.stale(root, "A.md"), [(2, "platform/gone.py")])

    def test_logs_are_exempt(self):
        self.assertTrue(c.is_log("prompts/runs/x.md"))
        self.assertTrue(c.is_log("prompts/experiments.md"))
        self.assertFalse(c.is_log("prompts/README.md"))

    def test_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "A.md").write_text("`platform/gone.py`\n")
            (root / "B.md").write_text("nothing\n")
            self.assertEqual(c.main(["--root", d, "A.md"]), 1)
            self.assertEqual(c.main(["--root", d, "B.md"]), 0)


if __name__ == "__main__":
    unittest.main()
