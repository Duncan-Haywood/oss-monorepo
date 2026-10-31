import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

import missing_llms_txt as m


class MissingLlms(unittest.TestCase):
    def test_flagships_first_and_present_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d)
            for n in ("a", "b", "c"):
                (v / n).mkdir()
            (v / "c" / "llms.txt").write_text("x")
            first, rest, total = m.missing(v, ["b", "c", "zzz"])
            self.assertEqual((first, rest, total), (["b"], ["a"], 3))

    def test_not_a_venture_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d)
            for n in ("a", "tool"):
                (v / n).mkdir()
            (v / "tool" / "NOT-A-VENTURE").write_text("x")
            self.assertEqual(m.missing(v, []), ([], ["a"], 1))

    def test_flagship_names(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "f.yaml"
            f.write_text("flagships:\n  - venture: ai-bookkeeper\n    why: x\n")
            self.assertEqual(m.flagship_names(f), ["ai-bookkeeper"])

    def test_flagship_names_missing_file(self):
        self.assertEqual(m.flagship_names(Path("/nonexistent/f.yaml")), [])

    def _run(self, *argv):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for n in ("a", "b", "c"):
                (root / "ventures" / n).mkdir(parents=True)
            (root / "ventures" / "c" / "llms.txt").write_text("x")
            (root / "portfolio").mkdir()
            (root / "portfolio" / "flagships.yaml").write_text("- venture: b\n")
            old_repo, old_argv = m.REPO, sys.argv
            m.REPO, sys.argv = root, ["missing_llms_txt.py", *argv]
            out = io.StringIO()
            try:
                with contextlib.redirect_stdout(out):
                    code = m.main()
            finally:
                m.REPO, sys.argv = old_repo, old_argv
            return code, out.getvalue()

    def test_main_default_lists_flagships_then_rest(self):
        self.assertEqual(self._run(), (0, "b\t(flagship)\na\n"))

    def test_main_count(self):
        self.assertEqual(self._run("--count"), (0, "2/3\n"))

    def test_main_flagships_only(self):
        self.assertEqual(self._run("--flagships"), (0, "b\t(flagship)\n"))

    def test_repo_points_at_checkout_root(self):
        self.assertTrue((m.REPO / "ventures").is_dir())
        self.assertTrue((m.REPO / "platform" / "ci").is_dir())


if __name__ == "__main__":
    unittest.main()
