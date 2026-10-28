import subprocess
import tempfile
import unittest
from pathlib import Path

import check_code_refs as c


class Candidate(unittest.TestCase):
    def test_plain_path(self):
        self.assertEqual(c.candidate("platform/ci/x.py"), "platform/ci/x.py")

    def test_suffixes_stripped(self):
        self.assertEqual(c.candidate("a/b.md:12"), "a/b.md")
        self.assertEqual(c.candidate("a/b.md#sec"), "a/b.md")
        self.assertEqual(c.candidate("a/b.py --flag"), "a/b.py")

    def test_not_paths(self):
        for t in ("ventures/<slug>/x", "a/*.py", "https://x/y", "/abs/p", "foo", "a/b|c",
                  "prompts/runs/YYYY-MM.md"):
            self.assertIsNone(c.candidate(t), t)


class Missing(unittest.TestCase):
    def test_finds_only_missing_rooted_paths(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform").mkdir()
            (root / "platform/real.py").write_text("")
            doc = root / "doc.md"
            doc.write_text(
                "`platform/real.py` `platform/gone.py` `owner/repo`\n"
                "```\n`platform/fenced.py`\n```\n`platform/gone2.py:3`\n")
            subprocess.run(["git", "-C", d, "init", "-q"], check=True)
            subprocess.run(["git", "-C", d, "add", "-A"], check=True)
            got = list(c.missing_refs(doc, root, {"platform"}))
            self.assertEqual(got, [(1, "platform/gone.py"), (5, "platform/gone2.py")])


class Main(unittest.TestCase):
    def _repo(self, d, doc):
        root = Path(d)
        (root / "platform").mkdir()
        (root / "platform/real.py").write_text("")
        (root / "doc.md").write_text(doc)
        subprocess.run(["git", "-C", d, "init", "-q"], check=True)
        subprocess.run(["git", "-C", d, "add", "-A"], check=True)
        return root

    def test_exit_codes_and_count(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as d:
            root = self._repo(d, "`platform/real.py`\n")
            self.assertEqual(c.main(["--root", d, str(root / "doc.md")]), 0)
        with tempfile.TemporaryDirectory() as d:
            root = self._repo(d, "`platform/gone.py` `platform/gone2.py`\n")
            err, out = io.StringIO(), io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
                rc = c.main(["--root", d, str(root / "doc.md")])
            self.assertEqual(rc, 1)
            self.assertIn("2 backticked path(s)", err.getvalue())
            self.assertIn("doc.md:1: platform/gone.py", out.getvalue())

    def test_tracked_fails_outside_a_repo(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(subprocess.CalledProcessError):
                c.tracked(Path(d))

    def test_top_level_names_only(self):
        # a path under a nested dir name must not count as a top-level root
        with tempfile.TemporaryDirectory() as d:
            root = self._repo(d, "`real.py/x` `platform/gone.py`\n")
            got = list(c.missing_refs(root / "doc.md", root, {p.split("/", 1)[0] for p in c.tracked(root) if "/" in p}))
            self.assertEqual(got, [(1, "platform/gone.py")])


if __name__ == "__main__":
    unittest.main()
