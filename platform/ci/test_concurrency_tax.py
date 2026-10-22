"""Tests for concurrency_tax.py's pull-ref listing, which must read both the
probe clone's `refs/pull/<n>` and a working repository's `refs/pull/<n>/head`."""
import contextlib
import io
import os
import subprocess
import tempfile
import unittest

import concurrency_tax as ct


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True,
                          text=True).stdout.strip()


class TestPullNumbers(unittest.TestCase):
    def test_reads_both_ref_layouts(self):
        with tempfile.TemporaryDirectory() as repo:
            git(repo, "init", "-q")
            git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q",
                "--allow-empty", "-m", "x")
            for ref in ("refs/pull/7/head", "refs/pull/12"):
                git(repo, "update-ref", ref, "HEAD")
            self.assertEqual(sorted(ct.pull_numbers(repo)), [7, 12])


def commit(repo, msg, name=None):
    if name:
        path = os.path.join(repo, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a") as fh:
            fh.write(msg)
        git(repo, "add", name)
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q",
        "--allow-empty", "-m", msg)
    return git(repo, "rev-parse", "HEAD")


def make_repo(tmp):
    """main with a base commit; PR 5 has two own commits (one housekeeping) and
    merges main back in once; PR 6 has one clean commit; PR 7 has 51 own commits."""
    git(tmp, "init", "-q", "-b", "main")
    base = commit(tmp, "base", "a.txt")
    git(tmp, "checkout", "-q", "-b", "pr5")
    commit(tmp, "work", "b.txt")
    commit(tmp, "regen counts")
    git(tmp, "checkout", "-q", "main")
    commit(tmp, "main moves", "c.txt")
    git(tmp, "checkout", "-q", "pr5")
    git(tmp, "-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-edit", "main")
    git(tmp, "update-ref", "refs/pull/5/head", "pr5")
    git(tmp, "checkout", "-q", "-b", "pr6", base)
    commit(tmp, "feature", "d.txt")
    git(tmp, "update-ref", "refs/pull/6/head", "pr6")
    git(tmp, "checkout", "-q", "-b", "pr7", base)
    for i in range(51):
        commit(tmp, f"import {i}")
    git(tmp, "update-ref", "refs/pull/7/head", "pr7")
    git(tmp, "update-ref", "refs/remotes/origin/main", "main")
    git(tmp, "checkout", "-q", "main")


class TestPrRounds(unittest.TestCase):
    def test_counts_merges_housekeeping_and_skips_imports(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            rows = ct.pr_rounds(tmp, 4, 8, local=True)
        # (n, own commits, merge-main rounds, housekeeping); PR 7 is an import.
        self.assertEqual(rows, [(5, 2, 1, 1), (6, 1, 0, 0)])

    def test_range_includes_last_and_excludes_after(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            self.assertEqual([r[0] for r in ct.pr_rounds(tmp, 6, 6, local=True)], [6])
            self.assertEqual(ct.pr_rounds(tmp, 4, 5, local=True)[-1][0], 5)
            self.assertEqual(ct.pr_rounds(tmp, 7, 7, local=True), [])

    def test_probe_layout_reads_refs_without_head_suffix(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            git(tmp, "update-ref", "-d", "refs/pull/6/head")
            git(tmp, "update-ref", "refs/pull/6", "pr6")
            self.assertEqual([r[0] for r in ct.pr_rounds(tmp, 5, 6, local=False)], [6])

    def test_default_reads_probe_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)  # refs/pull/<n>/head only: the probe layout finds nothing
            self.assertEqual(ct.pr_rounds(tmp, 5, 6), [])

    def test_own_commit_cap_is_inclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            git(tmp, "init", "-q", "-b", "main")
            base = commit(tmp, "base", "a.txt")
            git(tmp, "checkout", "-q", "-b", "pr8", base)
            for i in range(ct.MAX_OWN_COMMITS):
                commit(tmp, f"work {i}")
            git(tmp, "update-ref", "refs/pull/8/head", "pr8")
            git(tmp, "update-ref", "refs/remotes/origin/main", "main")
            rows = ct.pr_rounds(tmp, 8, 8, local=True)
        self.assertEqual(rows, [(8, ct.MAX_OWN_COMMITS, 0, 0)])

    def test_pr_with_no_common_history_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            git(tmp, "checkout", "-q", "--orphan", "pr9")
            commit(tmp, "unrelated", "z.txt")
            git(tmp, "update-ref", "refs/pull/9/head", "pr9")
            git(tmp, "checkout", "-q", "main")
            self.assertEqual([r[0] for r in ct.pr_rounds(tmp, 9, 9, local=True)], [])

    def test_housekeeping_pattern(self):
        for subject in ("regenerate pages", "sync tree counts", "resolve conflict",
                        "fix after merge", "update count", "mirror research"):
            self.assertTrue(ct.HOUSEKEEPING.search(subject), subject)
        self.assertFalse(ct.HOUSEKEEPING.search("add calculator"))


class TestRefreshLocal(unittest.TestCase):
    def test_shallow_since_is_30_days_before_window(self):
        calls = []
        orig = ct.uw.git
        ct.uw.git = lambda args, repo, **kw: calls.append(args) or ""
        try:
            ct.refresh_local(".", "2026-10-31")
        finally:
            ct.uw.git = orig
        self.assertIn("--shallow-since=2026-10-01", calls[0])


class TestHotspots(unittest.TestCase):
    def test_counts_each_file_once_per_landed_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            git(tmp, "init", "-q", "-b", "main")
            commit(tmp, "root", "r.txt")  # diff-tree skips a parentless commit
            commit(tmp, "one", "x/y/z.txt")
            commit(tmp, "two", "x/y/z.txt")
            commit(tmp, "three", "x/w.txt")
            git(tmp, "update-ref", "refs/remotes/origin/main", "main")
            landed, files, prefixes = ct.hotspots(tmp, "2000-01-01")
        self.assertEqual(landed, 4)
        self.assertEqual(files["x/y/z.txt"], 2)
        self.assertEqual(files["x/w.txt"], 1)
        # prefixes keep the first two path parts only
        self.assertEqual(prefixes["x/y"], 2)
        self.assertEqual(prefixes["x/w.txt"], 1)


class TestMain(unittest.TestCase):
    def run_main(self, tmp, *extra):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = ct.main(["--repo", tmp, "--local", "--since", "2000-01-01", *extra])
        return code, out.getvalue(), err.getvalue()

    def setUp(self):
        self._refresh = ct.refresh_local
        ct.refresh_local = lambda repo, since: None

    def tearDown(self):
        ct.refresh_local = self._refresh

    def test_report_defaults_to_last_pr(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            code, out, _ = self.run_main(tmp, "--first-pr", "1")
        self.assertEqual(code, 0)
        self.assertIn("PRs #1-#7: 2 sampled", out)
        self.assertIn("PRs that merged main back in at least once: 1 (50%)", out)
        self.assertIn("commits: 3 own + 1 merge-main; 1 of the own are housekeeping", out)
        self.assertIn("concurrency tax (housekeeping + merge-main): 50%", out)

    def test_default_window_is_400_prs_back_from_newest(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            _, out, _ = self.run_main(tmp)
        self.assertIn("PRs #1-#7:", out)  # clamped: no PR numbers below 1

    def test_default_window_starts_exactly_400_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            for n in (99, 100):
                git(tmp, "update-ref", f"refs/pull/{n}/head", "pr6")
            _, out, _ = self.run_main(tmp, "--last-pr", "500")
        self.assertIn("PRs #100-#500: 1 sampled", out)

    def test_default_since_is_14_days_back(self):
        seen = []
        ct.refresh_local = lambda repo, since: seen.append(since)
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                ct.main(["--repo", tmp, "--local"])
        self.assertEqual(seen, [(ct.date.today() - ct.timedelta(days=14)).isoformat()])

    def test_default_lists_top_12_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            make_repo(tmp)
            for i in range(13):
                commit(tmp, f"f{i}", f"dir{i}/file{i}.txt")
            git(tmp, "update-ref", "refs/remotes/origin/main", "main")
            _, out, _ = self.run_main(tmp)
        listed = out.split("Files the most")[1].split("Top-level areas:")[0]
        self.assertEqual(len([l for l in listed.splitlines() if "%  " in l]), 12)

    def test_merge_and_housekeeping_totals_are_summed_from_their_own_columns(self):
        rows = [(1, 5, 3, 1), (2, 4, 2, 0)]
        saved = (ct.pr_rounds, ct.hotspots)
        ct.pr_rounds = lambda *a, **k: rows
        ct.hotspots = lambda *a, **k: (1, ct.Counter(), ct.Counter())
        try:
            with tempfile.TemporaryDirectory() as tmp:
                make_repo(tmp)
                code, out, _ = self.run_main(tmp, "--first-pr", "1")
        finally:
            ct.pr_rounds, ct.hotspots = saved
        self.assertEqual(code, 0)
        self.assertIn("commits: 9 own + 5 merge-main; 1 of the own are housekeeping", out)

    def test_help_describes_the_tool_with_its_first_paragraph(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            ct.main(["--help"])
        self.assertIn(ct.__doc__.split("\n\n")[0].split()[0], out.getvalue())

    def test_no_pull_refs_is_a_clean_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            git(tmp, "init", "-q", "-b", "main")
            commit(tmp, "base", "a.txt")
            git(tmp, "update-ref", "refs/remotes/origin/main", "main")
            code, _, err = self.run_main(tmp)
        self.assertEqual(code, 2)
        self.assertIn("concurrency_tax", err)

    def test_git_failure_exits_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = self.run_main(tmp)
        self.assertEqual(code, 2)
        self.assertIn("could not answer", err)


if __name__ == "__main__":
    unittest.main()
