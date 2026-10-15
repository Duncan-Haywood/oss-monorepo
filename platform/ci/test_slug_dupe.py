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

    def test_branch_only_is_notice(self):
        on_main, commits, branches = slug_dupe.check("bar-tool")
        self.assertFalse(on_main)
        self.assertEqual(commits, [])
        self.assertEqual(branches, ["claude/bar-tool-1"])
        self.assertEqual(slug_dupe.main(["bar-tool"]), 0)

    def test_unknown(self):
        self.assertEqual(slug_dupe.check("nope-zzz"), (False, [], []))


if __name__ == "__main__":
    unittest.main()
