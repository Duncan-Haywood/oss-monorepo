import os
import subprocess
import tempfile
import unittest

from swe_prlifetime import analyse as a


def git(d, *args):
    return subprocess.run(["git", "-C", d, *args], check=True, capture_output=True, text=True).stdout.strip()


class Pure(unittest.TestCase):
    def test_ts(self):
        self.assertEqual(a.ts("1970-01-01T00:01:00Z"), 60)

    def test_pr_regex(self):
        self.assertEqual(a.PR_RE.search("x: y (#12)").group(1), "12")
        self.assertEqual(a.PR_RE.search("Merge pull request #7754 from a/b").group(2), "7754")
        self.assertIsNone(a.PR_RE.search("no number (#12) in the middle here"))

    def test_percentile(self):
        self.assertEqual(a.pctl([1, 2, 3, 4, 5], 0.5), 3)
        self.assertEqual(a.pctl([0, 10], 0.25), 2.5)

    def test_wilson_contains_point(self):
        lo, hi = a.wilson(5, 20)
        self.assertLess(lo, 0.25)
        self.assertGreater(hi, 0.25)
        self.assertNotEqual(a.wilson(0, 0)[0], a.wilson(0, 0)[0])  # nan

    def test_join_drops_forks_and_unknown(self):
        prs = {1: (0, 60, "duncan-haywood/oss-monorepo"), 2: (0, 60, "someone/fork")}
        ms = [dict(pr=1, files=set()), dict(pr=2, files=set()), dict(pr=3, files=set()), dict(pr=None, files=set())]
        kept, no_pr, unknown, fork = a.join(ms, prs)
        self.assertEqual((len(kept), no_pr, unknown, fork), (1, 1, 1, 1))
        self.assertEqual(kept[0]["merged"], 60)

    def test_landings_during_half_open(self):
        sh = a.SHARED[0]
        ms = [dict(sha="a", time=100, files={sh}), dict(sha="b", time=200, files={sh}),
              dict(sha="c", time=300, files={"x"}), dict(sha="d", time=400, files={sh})]
        me = dict(sha="d", time=400, created=100)
        self.assertEqual(a.landings_during(me, ms), 2)  # a (at creation) and b; not c (other file), not itself
        self.assertEqual(a.landings_during(dict(sha="d", time=400, created=101), ms), 1)

    def test_read_prs_skips_unmerged(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write("number,created_at,merged_at,head_repo\n1,1970-01-01T00:00:00Z,1970-01-01T00:01:00Z,o/r\n2,1970-01-01T00:00:00Z,,o/r\n")
        try:
            self.assertEqual(list(a.read_prs(f.name)), [1])
        finally:
            os.unlink(f.name)


class Replay(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        git(self.d, "init", "-q", "-b", "main")
        git(self.d, "config", "user.email", "t@t")
        git(self.d, "config", "user.name", "t")

    def commit(self, text, msg="c", env=None):
        with open(os.path.join(self.d, "f.txt"), "w") as fh:
            fh.write(text)
        git(self.d, "add", "-A")
        subprocess.run(["git", "-C", self.d, "commit", "-q", "-m", msg], check=True, env=env)
        return git(self.d, "rev-parse", "HEAD")

    def test_clean_and_conflicting(self):
        base = self.commit("a\nb\nc\nd\ne\nf\ng\n")
        self.commit("a\nb\nc\nd\ne\nf\nG\n", msg="earlier")           # lands during the PR's life
        clean = self.commit("A\nb\nc\nd\ne\nf\nG\n", msg="pr clean")   # edits the far end of the file
        self.assertEqual(a.conflicts(clean, base, self.d), set())
        clash = self.commit("A\nb\nc\nd\ne\nf\nH\n", msg="pr clash")   # edits the line `earlier` changed
        self.assertEqual(a.conflicts(clash, base, self.d), {"f.txt"})

    def test_base_at(self):
        env = dict(os.environ, GIT_AUTHOR_DATE="2000-01-01T00:00:00Z", GIT_COMMITTER_DATE="2000-01-01T00:00:00Z")
        old = self.commit("1", msg="old", env=env)
        self.commit("2", msg="new")
        self.assertEqual(a.base_at(946684800 + 10, "main", self.d), old)


if __name__ == "__main__":
    unittest.main()
