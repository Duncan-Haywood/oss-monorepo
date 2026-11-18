"""Tests for fetch_ref.py on throwaway local repositories (no network)."""
import datetime as dt
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_ref as fr  # noqa: E402

T0 = 1_700_000_000  # commit dates: one hour apart from here


def git(cwd, *args, when=None):
    env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
    if when is not None:
        env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = f"@{when} +0000"
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                           "-c", "protocol.file.allow=always", *args],
                          cwd=cwd, env=env, capture_output=True, text=True, check=True).stdout.strip()


class FetchRefTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.up = base / "up"
        self.up.mkdir()
        git(self.up, "init", "-q", "-b", "main")
        git(self.up, "config", "uploadpack.allowFilter", "true")
        for i in range(30):  # main: 30 commits, hourly
            git(self.up, "commit", "-q", "--allow-empty", "-m", f"m{i}", when=T0 + i * 3600)
        # A session branch cut 2 commits back from main's tip, one commit of its own.
        git(self.up, "branch", "work", "HEAD~2")
        git(self.up, "checkout", "-q", "work")
        git(self.up, "commit", "-q", "--allow-empty", "-m", "w", when=T0 + 30 * 3600)
        # An old branch: every commit older than the window the clone will hold.
        git(self.up, "checkout", "-q", "-b", "old", "main~25")
        git(self.up, "commit", "-q", "--allow-empty", "-m", "o", when=T0 + 5 * 3600 + 60)
        git(self.up, "checkout", "-q", "main")
        self.clone = base / "clone"
        git(base, "clone", "-q", "--depth=1", "--branch", "main", f"file://{self.up}", str(self.clone))
        # The session deepens main on purpose (as friction_rank and measure do).
        git(self.clone, "fetch", "-q", f"--shallow-since=@{T0 + 10 * 3600}", "origin", "main")
        self.deep = int(git(self.clone, "rev-list", "--count", "HEAD"))
        self.now = dt.datetime.fromtimestamp(T0 + 31 * 3600, dt.timezone.utc)

    def tearDown(self):
        self.tmp.cleanup()

    def count(self):
        return int(git(self.clone, "rev-list", "--count", "HEAD"))

    def test_depth_fetch_cuts_main_this_tool_does_not(self):
        self.assertEqual(self.deep, 20)  # commits m10..m29
        out = io.StringIO()
        rc = fr.fetch_ref("work", days=1 / 24, cwd=self.clone, out=out, now=self.now)
        self.assertEqual(rc, 0, out.getvalue())
        self.assertEqual(self.count(), self.deep)
        self.assertTrue(git(self.clone, "merge-base", "HEAD", "origin/work"))
        self.assertIn("20 -> 20 commits", out.getvalue())
        # The documented `--depth=N` fetch, for contrast: main's history is cut.
        git(self.clone, "fetch", "-q", "--depth=3", "origin", "work")
        self.assertLess(self.count(), self.deep)

    def test_old_branch_falls_back_to_its_own_commits(self):
        out = io.StringIO()
        rc = fr.fetch_ref("old", days=1 / 24, cwd=self.clone, out=out, now=self.now)
        self.assertEqual(rc, 0, out.getvalue())
        self.assertEqual(self.count(), self.deep)
        self.assertEqual(git(self.clone, "log", "-1", "--format=%s", "origin/old"), "o")
        self.assertIn("own commits", out.getvalue())

    def test_missing_branch_fails_with_gits_message(self):
        out = io.StringIO()
        self.assertEqual(fr.fetch_ref("nope", cwd=self.clone, out=out, now=self.now), 1)
        self.assertIn("couldn't find remote ref", out.getvalue())

    def test_since_never_later_than_the_oldest_commit(self):
        now = dt.datetime(2026, 11, 17, tzinfo=dt.timezone.utc)
        old = int(dt.datetime(2026, 11, 14, tzinfo=dt.timezone.utc).timestamp())
        self.assertEqual(fr.since_for(old, 1, now), "2026-11-13T23:59:00Z")
        self.assertEqual(fr.since_for(None, 1, now), "2026-11-16T00:00:00Z")
        self.assertEqual(fr.since_for(int(now.timestamp()), 2, now), "2026-11-15T00:00:00Z")

    def test_refspecs(self):
        self.assertEqual(fr.refspec("pull/12/head"), "+refs/pull/12/head:refs/remotes/origin/pr/12")
        self.assertEqual(fr.refspec("origin/main"), "+refs/heads/main:refs/remotes/origin/main")
        self.assertEqual(fr.refspec("claude/x"), "+refs/heads/claude/x:refs/remotes/origin/claude/x")


if __name__ == "__main__":
    unittest.main()
