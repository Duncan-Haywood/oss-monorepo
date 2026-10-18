"""Tests for slug_dupe.py against a throwaway origin."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import slug_dupe


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env=dict(os.environ, GIT_TERMINAL_PROMPT="0",
                                   GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t",
                                   GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")).stdout.strip()


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        origin, self.clone = root / "o.git", root / "c"
        run(root, "init", "--bare", "-b", "main", str(origin))
        run(root, "clone", str(origin), str(self.clone))
        (self.clone / "ventures/foo-calc").mkdir(parents=True)
        (self.clone / "ventures/foo-calc/a.txt").write_text("x")
        run(self.clone, "add", "-A")
        run(self.clone, "commit", "-m", "foo-calc: new venture")
        run(self.clone, "push", "origin", "HEAD:main")
        run(self.clone, "push", "origin", "HEAD:refs/heads/claude/bar-tool-1")
        run(self.clone, "fetch", "origin")
        self.cwd = os.getcwd()
        os.chdir(self.clone)

    def tearDown(self):
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def test_on_main(self):
        on_main, commits, _ = slug_dupe.check("foo-calc")
        self.assertTrue(on_main)
        self.assertEqual(len(commits), 1)
        self.assertEqual(slug_dupe.main(["foo-calc"]), 1)

    def test_recent_commit_without_directory_is_duplicate(self):
        (self.clone / "other.txt").write_text("y")
        run(self.clone, "add", "-A")
        run(self.clone, "commit", "-m", "baz-gadget: started")
        run(self.clone, "push", "origin", "HEAD:main")
        run(self.clone, "fetch", "origin")
        on_main, commits, _ = slug_dupe.check("baz-gadget")
        self.assertFalse(on_main)
        self.assertEqual(len(commits), 1)
        self.assertEqual(slug_dupe.main(["baz-gadget"]), 1)

    def test_directory_older_than_window_is_still_duplicate(self):
        (self.clone / "ventures/old-tool").mkdir(parents=True)
        (self.clone / "ventures/old-tool/a.txt").write_text("x")
        run(self.clone, "add", "-A")
        os.environ["GIT_AUTHOR_DATE"] = os.environ["GIT_COMMITTER_DATE"] = "2020-01-01T00:00:00"
        try:
            run(self.clone, "commit", "-m", "old-tool: new venture")
        finally:
            del os.environ["GIT_AUTHOR_DATE"], os.environ["GIT_COMMITTER_DATE"]
        run(self.clone, "push", "origin", "HEAD:main")
        run(self.clone, "fetch", "origin")
        on_main, commits, _ = slug_dupe.check("old-tool")
        self.assertTrue(on_main)
        self.assertEqual(commits, [])
        self.assertEqual(slug_dupe.main(["old-tool"]), 1)

    def test_branch_only_is_notice(self):
        on_main, commits, branches = slug_dupe.check("bar-tool")
        self.assertFalse(on_main)
        self.assertEqual(commits, [])
        self.assertEqual(branches, ["claude/bar-tool-1"])
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(slug_dupe.main(["bar-tool"]), 0)
        self.assertIn("notice: branch claude/bar-tool-1", out.getvalue())
        self.assertNotIn("no duplicate found", out.getvalue())

    def test_unknown_slug_says_no_duplicate(self):
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(slug_dupe.main(["nope-zzz"]), 0)
        self.assertIn("nope-zzz: no duplicate found", out.getvalue())

    def test_default_window_is_14_days(self):
        seen = []
        orig = slug_dupe.check
        slug_dupe.check = lambda slug, days, remote: seen.append((days, remote)) or (False, [], [])
        try:
            slug_dupe.main(["x"])
        finally:
            slug_dupe.check = orig
        self.assertEqual(seen, [(14, "origin")])

    def test_help_uses_summary_line(self):
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            slug_dupe.main(["--help"])
        self.assertIn("Has someone already shipped", out.getvalue())

    def test_unknown(self):
        self.assertEqual(slug_dupe.check("nope-zzz"), (False, [], []))


if __name__ == "__main__":
    unittest.main()
