import csv
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from swe_branchlife import analyse as a


class T(unittest.TestCase):
    def test_read_branches(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "b.csv"
            p.write_text("number,first_commit,n_commits,truncated\n5,2026-10-16T00:10:00Z,3,0\n")
            self.assertEqual(a.read_branches(p), {5: (a.ts("2026-10-16T00:10:00Z"), 3, False)})

    def test_attach_clamps_skew_and_counts_missing(self):
        kept = [dict(pr=1, created=1000, merged=2000), dict(pr=2, created=1000, merged=2000), dict(pr=3, created=1, merged=2)]
        rows, missing, skewed = a.attach(kept, {1: (400, 2, False), 2: (1500, 1, False)})
        self.assertEqual((missing, skewed), (1, 1))
        self.assertEqual([r["first"] for r in rows], [400, 1000])

    def test_branch_minutes(self):
        self.assertEqual(a.branch_minutes([dict(first=0, merged=600), dict(first=100, merged=50)]), [10.0, 0.0])

    def test_landings_between_half_open(self):
        me = dict(sha="m", time=100)
        ms = [dict(sha="a", time=50, files={"research/README.md"}),
              dict(sha="b", time=100, files={"research/README.md"}),     # at the merge: excluded
              dict(sha="c", time=60, files={"research/x/README.md"}),   # not a shared file
              dict(sha="m", time=100, files={"research/README.md"}),    # itself
              dict(sha="d", time=10, files={"research/README.md"})]     # before start
        self.assertEqual(a.landings_between(me, ms, 50), 1)
        self.assertEqual(a.research_landings_between(me, ms, 50), 2)

    def test_pctl_and_wilson_reused(self):
        self.assertAlmostEqual(a.pctl([1, 2, 3, 4, 5], .5), 3)
        lo, hi = a.wilson(0, 10)
        self.assertAlmostEqual(lo, 0.0)
        self.assertGreater(hi, 0.2)


class Replay(unittest.TestCase):
    """Branch start earlier than creation exposes a PR to a landing the PR-lifetime replay misses."""

    def git(self, d, *args):
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        return subprocess.run(["git", "-C", d, *args], capture_output=True, text=True, env=env, check=True).stdout.strip()

    def test_early_base_conflicts_late_base_does_not(self):
        with tempfile.TemporaryDirectory() as d:
            self.git(d, "init", "-q", "-b", "main")
            f = Path(d) / "f.txt"
            f.write_text("a\nb\nc\n")
            self.git(d, "add", "."); self.git(d, "commit", "-qm", "base", "--date=@100")
            base = self.git(d, "rev-parse", "HEAD")
            f.write_text("a\nB-main\nc\n")                       # another PR lands on line 2
            self.git(d, "commit", "-qam", "other (#1)")
            other = self.git(d, "rev-parse", "HEAD")
            # the PR's squash commit: edits the same line on top of `other`
            f.write_text("a\nB-pr\nc\n")
            self.git(d, "commit", "-qam", "pr (#2)")
            sq = self.git(d, "rev-parse", "HEAD")
            self.assertEqual(a.conflicts(sq, base, d), {"f.txt"})   # branch cut before `other` landed: collides
            self.assertEqual(a.conflicts(sq, other, d), set())      # branch cut after it: clean
