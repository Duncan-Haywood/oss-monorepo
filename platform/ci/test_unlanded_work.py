"""Tests for unlanded_work.py, against throwaway git repositories.

Each case builds a bare "GitHub" with real `refs/pull/<n>/head` refs, so the
tool reads them through `git ls-remote` and `git fetch` exactly as it reads
github.com -- no mocks of the part that decides.
"""
import io
import os
import subprocess
import tempfile
import unittest
import unittest.mock
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import unlanded_work as uw


def run(cwd, *args, env=None):
    full_env = dict(os.environ, GIT_TERMINAL_PROMPT="0", **(env or {}))
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True, env=full_env
    ).stdout.strip()


class Fixture(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.origin = root / "origin.git"
        self.clone = root / "clone"
        run(root, "init", "-q", "--bare", "-b", "main", str(self.origin))
        run(self.origin, "config", "uploadpack.allowFilter", "true")
        run(root, "clone", "-q", self.origin.as_uri(), str(self.clone))
        for key, value in (("user.name", "t"), ("user.email", "t@example.com"),
                           ("commit.gpgsign", "false")):
            run(self.clone, "config", key, value)
        self.commit("README.md", "base\n", "base")
        run(self.clone, "push", "-q", "origin", "HEAD:main")
        self.probe = root / "probe.git"

    def tearDown(self):
        self._tmp.cleanup()

    def commit(self, path, text, message, day=None):
        target = self.clone / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        run(self.clone, "add", path)
        env = None
        if day:
            stamp = f"{day}T12:00:00+0000"
            env = {"GIT_COMMITTER_DATE": stamp, "GIT_AUTHOR_DATE": stamp}
        run(self.clone, "commit", "-q", "-m", message, env=env)
        return run(self.clone, "rev-parse", "HEAD")

    def branch(self, name):
        run(self.clone, "checkout", "-q", "-B", name, "origin/main")

    def push(self, name):
        run(self.clone, "push", "-q", "-u", "origin", name)

    def open_pr(self, number, sha):
        """What GitHub does when a PR is opened (and on every push while it is open)."""
        run(self.origin, "update-ref", f"refs/pull/{number}/head", sha)

    def squash_merge(self, path, text, message):
        """Land content on main as a new commit, the way a squash merge does."""
        here = run(self.clone, "rev-parse", "--abbrev-ref", "HEAD")
        run(self.clone, "fetch", "-q", "origin")
        run(self.clone, "checkout", "-q", "--detach", "origin/main")
        self.commit(path, text, message)
        run(self.clone, "push", "-q", "origin", "HEAD:main")
        run(self.clone, "checkout", "-q", here)
        run(self.clone, "fetch", "-q", "origin")

    def check(self):
        return uw.check_branch(str(self.clone), probe=self.probe)


class TestCheckBranch(Fixture):
    def test_fresh_branch_with_no_commits_has_nothing_to_land(self):
        self.branch("claude/fresh")
        report = self.check()
        self.assertEqual(report.exit_code, 0)
        self.assertIn("nothing to land", " ".join(report.notes))

    def test_committed_but_never_pushed_is_flagged(self):
        self.branch("claude/unpushed")
        self.commit("ventures/x/index.html", "x\n", "x: new venture")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertIn("is not on origin", report.problems[0])
        self.assertIn("git push -u origin claude/unpushed", report.problems[0])

    def test_pushed_with_no_pull_request_is_stranded(self):
        # The measured failure: built, committed, pushed -- and the session ended.
        self.branch("claude/pushed")
        sha = self.commit("ventures/x/index.html", "x\n", "x: new venture")
        self.push("claude/pushed")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertEqual([c.sha for c in report.stranded], [sha])
        self.assertIn("in no pull request", report.problems[0])
        self.assertIn("Open a pull request", report.problems[0])

    def test_tip_carried_by_a_pull_request_is_not_stranded(self):
        self.branch("claude/with-pr")
        sha = self.commit("ventures/x/index.html", "x\n", "x: new venture")
        self.push("claude/with-pr")
        self.open_pr(41, sha)
        report = self.check()
        self.assertEqual(report.exit_code, 0)
        self.assertEqual(report.stranded, [])
        # Exit 0 is "visible", not "merged" -- the report must not overclaim.
        self.assertIn("#41", report.notes[0])
        self.assertIn("cannot see whether it is merged", report.notes[0])

    def test_branch_deleted_after_its_pr_took_the_tip_is_not_stranded(self):
        # GitHub's auto-delete removes the head branch when the PR merges; the
        # session's local branch then has no remote, but nothing is stranded.
        self.branch("claude/merged-and-deleted")
        sha = self.commit("ventures/x/index.html", "x\n", "x: new venture")
        self.push("claude/merged-and-deleted")
        self.open_pr(43, sha)
        run(self.origin, "update-ref", "-d", "refs/heads/claude/merged-and-deleted")
        report = self.check()
        self.assertEqual(report.exit_code, 0, report.problems)
        self.assertIn("#43", report.notes[0])
        self.assertIn("cannot see whether it is merged", report.notes[0])

    def test_branch_deleted_with_a_tip_no_pr_carries_is_still_flagged(self):
        self.branch("claude/deleted-after-more-work")
        sha = self.commit("ventures/x/index.html", "x\n", "x: new venture")
        self.push("claude/deleted-after-more-work")
        self.open_pr(44, sha)
        run(self.origin, "update-ref", "-d", "refs/heads/claude/deleted-after-more-work")
        self.commit("ventures/x/more.html", "y\n", "x: more after the merge")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertIn("is not on origin", report.problems[0])

    def test_unpushed_commit_on_top_of_a_pushed_branch_is_flagged(self):
        self.branch("claude/ahead")
        sha = self.commit("a.txt", "a\n", "a")
        self.push("claude/ahead")
        self.open_pr(5, sha)
        self.commit("b.txt", "b\n", "b")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertIn("Push your commits", report.problems[0])

    def test_commits_after_the_branch_pr_merged_need_a_new_pr(self):
        self.branch("claude/after-merge")
        first = self.commit("ventures/x/index.html", "x\n", "x: new venture")
        self.push("claude/after-merge")
        self.open_pr(7, first)
        self.squash_merge("ventures/x/index.html", "x\n", "x: new venture (#7)")
        follow_up = self.commit("ventures/x/vs-y.html", "y\n", "x: comparison page")
        self.push("claude/after-merge")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertEqual([c.sha for c in report.stranded], [follow_up])
        self.assertIn("already had PR #7", report.problems[0])
        self.assertIn("Open a NEW pull request", report.problems[0])

    def test_re_pushing_a_spent_branch_at_main_is_noted(self):
        # The 2026-10-16 leak: reset to origin/main after the merge, push
        # again, and the deleted branch is back with nothing on it.
        self.branch("claude/spent")
        first = self.commit("a.txt", "a\n", "a")
        self.push("claude/spent")
        self.open_pr(11, first)
        self.squash_merge("a.txt", "a\n", "a (#11)")
        run(self.clone, "reset", "-q", "--hard", "origin/main")
        run(self.clone, "push", "-q", "-f", "origin", "claude/spent")
        report = self.check()
        self.assertEqual(report.exit_code, 0)
        self.assertIn("holds nothing beyond main", " ".join(report.notes))

    def test_merging_main_into_a_landed_branch_strands_nothing(self):
        # "Merge origin/main into my branch" carries nothing of its own.
        self.branch("claude/synced")
        first = self.commit("a.txt", "a\n", "a")
        self.push("claude/synced")
        self.open_pr(9, first)
        self.squash_merge("a.txt", "a\n", "a (#9)")
        self.squash_merge("other.txt", "o\n", "someone else's work (#10)")
        run(self.clone, "merge", "-q", "--no-edit", "origin/main")
        self.push("claude/synced")
        report = self.check()
        self.assertEqual(report.stranded, [])
        self.assertEqual(report.exit_code, 0)

    def test_uncommitted_work_is_flagged(self):
        self.branch("claude/dirty")
        sha = self.commit("a.txt", "a\n", "a")
        self.push("claude/dirty")
        self.open_pr(3, sha)
        (self.clone / "new-page.html").write_text("unsaved\n")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertIn("uncommitted", report.problems[0])
        self.assertIn("new-page.html", report.problems[0])

    def test_detached_head_cannot_answer(self):
        run(self.clone, "checkout", "-q", "--detach", "origin/main")
        with self.assertRaises(uw.GitError) as caught:
            self.check()
        self.assertIn("detached", str(caught.exception))

    def test_main_itself_cannot_answer(self):
        run(self.clone, "checkout", "-q", "-B", "main", "origin/main")
        with self.assertRaises(uw.GitError):
            self.check()


class TestSweep(Fixture):
    def test_lists_only_branches_with_stranded_work_within_the_window(self):
        self.branch("claude/stranded")
        self.commit("ventures/s/index.html", "s\n", "s: new venture", day="2026-10-01")
        self.push("claude/stranded")

        self.branch("claude/has-pr")
        sha = self.commit("ventures/p/index.html", "p\n", "p: new venture", day="2026-10-01")
        self.push("claude/has-pr")
        self.open_pr(12, sha)

        self.branch("claude/old")
        self.commit("ventures/o/index.html", "o\n", "o: new venture", day="2026-08-01")
        self.push("claude/old")

        found = uw.sweep(str(self.clone), since="2026-09-01", probe=self.probe)
        self.assertEqual([row[1] for row in found], ["claude/stranded"])
        self.assertEqual(found[0][2][0].subject, "s: new venture")

        everything = uw.sweep(str(self.clone), since=None, probe=self.probe)
        self.assertEqual(sorted(row[1] for row in everything),
                         ["claude/old", "claude/stranded"])

    def test_same_day_branches_are_listed_in_reverse_name_order(self):
        # Red-team seeding (2026-10-19): sorting on the commit list instead of
        # the branch name passed every test.
        for name in ("claude/aaa", "claude/zzz"):
            self.branch(name)
            self.commit(f"{name}.txt", "x\n", name, day="2026-10-01")
            self.push(name)
        found = uw.sweep(str(self.clone), since=None, probe=self.probe)
        self.assertEqual([row[1] for row in found], ["claude/zzz", "claude/aaa"])

    def test_probe_is_created_under_directories_that_do_not_exist_yet(self):
        deep = self.probe.parent / "not" / "yet" / "probe.git"
        self.branch("claude/stranded")
        self.commit("a.txt", "a\n", "a", day="2026-10-01")
        self.push("claude/stranded")
        found = uw.sweep(str(self.clone), since=None, probe=deep)
        self.assertEqual([row[1] for row in found], ["claude/stranded"])

    def test_probe_directory_that_exists_but_is_not_a_repository_is_initialised(self):
        self.probe.mkdir()
        self.branch("claude/stranded")
        self.commit("a.txt", "a\n", "a", day="2026-10-01")
        self.push("claude/stranded")
        found = uw.sweep(str(self.clone), since=None, probe=self.probe)
        self.assertEqual([row[1] for row in found], ["claude/stranded"])

    def test_sweep_finds_its_own_probe_when_none_is_given(self):
        self.branch("claude/stranded")
        self.commit("a.txt", "a\n", "a", day="2026-10-01")
        self.push("claude/stranded")
        found = uw.sweep(str(self.clone), since=None)
        self.assertEqual([row[1] for row in found], ["claude/stranded"])

    def test_names_the_pr_a_branch_kept_pushing_after(self):
        self.branch("claude/kept-going")
        first = self.commit("a.txt", "a\n", "a", day="2026-10-01")
        self.push("claude/kept-going")
        self.open_pr(21, first)
        self.commit("b.txt", "b\n", "b", day="2026-10-02")
        self.push("claude/kept-going")
        found = uw.sweep(str(self.clone), since="2026-09-01", probe=self.probe)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0][3], [21])
        self.assertEqual([c.subject for c in found[0][2]], ["b"])

    def test_work_already_on_main_under_another_commit_is_not_reported(self):
        self.branch("claude/squashed")
        self.commit("ventures/q/index.html", "q\n", "q: new venture", day="2026-10-01")
        self.push("claude/squashed")
        self.squash_merge("ventures/q/index.html", "q\n", "q: new venture (#1)")
        self.assertEqual(uw.sweep(str(self.clone), since=None, probe=self.probe), [])

    def test_modified_file_counts_as_landed_only_when_main_has_the_same_bytes(self):
        self.branch("claude/same")
        self.commit("README.md", "edited\n", "edit readme", day="2026-10-01")
        self.push("claude/same")
        self.branch("claude/differs")
        self.commit("README.md", "mine\n", "edit readme differently", day="2026-10-01")
        self.push("claude/differs")
        self.squash_merge("README.md", "edited\n", "readme (#3)")
        found = uw.sweep(str(self.clone), since=None, probe=self.probe)
        self.assertEqual([r[1] for r in found], ["claude/differs"])

    def test_long_stranded_list_is_cut_at_the_limit_with_a_count(self):
        limit = uw.LIST_LIMIT
        self.branch("claude/exact")
        for i in range(limit):
            self.commit(f"e{i}.txt", "e\n", f"e{i}")
        self.push("claude/exact")
        self.assertNotIn("more", self.check().problems[0])
        self.commit("extra.txt", "x\n", "extra")
        self.push("claude/exact")
        self.assertIn("... and 1 more", self.check().problems[0])

    def test_work_main_has_not_got_is_still_reported(self):
        self.branch("claude/missing")
        self.commit("ventures/r/index.html", "mine\n", "r: new venture", day="2026-10-01")
        self.push("claude/missing")
        self.squash_merge("ventures/other/index.html", "x\n", "other (#2)")
        self.assertEqual([r[1] for r in uw.sweep(str(self.clone), since=None, probe=self.probe)],
                         ["claude/missing"])

    def test_gh_pages_is_never_reported(self):
        run(self.clone, "checkout", "-q", "--orphan", "gh-pages")
        run(self.clone, "rm", "-rq", "--cached", ".")
        self.commit("index.html", "site\n", "publish")
        self.push("gh-pages")
        self.assertEqual(uw.sweep(str(self.clone), since=None, probe=self.probe), [])

    def test_gh_pages_with_history_shared_with_main_is_never_reported(self):
        # The orphan case above is vacuous: with no merge base the content
        # check reads the branch as landed whatever the name filter does.
        self.branch("gh-pages")
        self.commit("index.html", "site\n", "publish", day="2026-10-01")
        self.push("gh-pages")
        self.assertEqual(uw.sweep(str(self.clone), since=None, probe=self.probe), [])

    def test_archive_branches_are_never_reported(self):
        self.branch("archive/research/claude/old-work")
        self.commit("a.txt", "a\n", "kept from oss-research-monorepo")
        self.push("archive/research/claude/old-work")
        self.assertEqual(uw.sweep(str(self.clone), since=None, probe=self.probe), [])


class TestMain(Fixture):
    def test_exit_codes_and_output(self):
        self.branch("claude/pushed")
        self.commit("a.txt", "a\n", "a")
        self.push("claude/pushed")
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = uw.main(["--repo", str(self.clone)])
        self.assertEqual(code, 1)
        self.assertIn("STRANDED", buf.getvalue())
        self.assertIn(".github/prompts/land-your-work.md", buf.getvalue())

    def test_sweep_defaults_to_a_recent_window(self):
        self.branch("claude/ancient")
        self.commit("a.txt", "a\n", "a", day="2020-01-01")
        self.push("claude/ancient")
        buf = io.StringIO()
        with redirect_stdout(buf):
            uw.main(["--sweep", "--repo", str(self.clone)])
        self.assertNotIn("claude/ancient", buf.getvalue())
        buf = io.StringIO()
        with redirect_stdout(buf):
            uw.main(["--sweep", "--since", "all", "--repo", str(self.clone)])
        self.assertIn("claude/ancient", buf.getvalue())

    def test_subject_containing_a_tab_is_kept_whole(self):
        self.branch("claude/tabbed")
        self.commit("a.txt", "a\n", "left\tright", day="2026-10-02")
        self.push("claude/tabbed")
        found = uw.sweep(str(self.clone), since="2026-09-01", probe=self.probe)
        self.assertEqual([c.subject for c in found[0][2]], ["left\tright"])

    def test_subject_with_several_tabs_is_kept_whole(self):
        self.branch("claude/many-tabs")
        self.commit("a.txt", "a\n", "a\tb\tc", day="2026-10-02")
        self.push("claude/many-tabs")
        found = uw.sweep(str(self.clone), since="2026-09-01", probe=self.probe)
        self.assertEqual([c.subject for c in found[0][2]], ["a\tb\tc"])

    def test_stranded_commits_keep_a_subject_with_several_tabs(self):
        self.branch("claude/tabs-check")
        self.commit("a.txt", "a\n", "a\tb\tc")
        run(self.clone, "push", "-q", "origin", "claude/tabs-check")
        report = self.check()
        self.assertEqual(report.exit_code, 1)
        self.assertIn("a\tb\tc", "\n".join(report.problems))

    def test_commits_are_listed_newest_first(self):
        self.branch("claude/two-days")
        self.commit("a.txt", "a\n", "older", day="2026-10-01")
        self.commit("b.txt", "b\n", "newer", day="2026-10-03")
        self.push("claude/two-days")
        found = uw.sweep(str(self.clone), since="2026-09-01", probe=self.probe)
        self.assertEqual([c.subject for c in found[0][2]], ["newer", "older"])

    def test_remote_refs_ignores_pull_refs_that_are_not_heads(self):
        listing = "\n".join([
            "a" * 40 + "\trefs/pull/7/head",
            "b" * 40 + "\trefs/pull/8/merge",
            "c" * 40 + "\trefs/pull/head",
            "e" * 40 + "\trefs/tags/12/head",
            "d" * 40 + "\trefs/heads/main",
        ])
        with unittest.mock.patch.object(uw, "git", return_value=listing):
            heads, pulls = uw.remote_refs(".", "origin")
        self.assertEqual(heads, {"main": "d" * 40})
        self.assertEqual(pulls, {"a" * 40: [7]})

    def test_unreadable_diff_does_not_raise(self):
        self.branch("claude/x")
        self.commit("a.txt", "a\n", "a")
        self.push("claude/x")
        run(self.clone, "fetch", "-q", "origin")
        self.assertTrue(uw.landed_by_content(
            str(self.clone), "origin/no-such-branch", "origin/main"))

    def test_help_describes_the_script_by_its_first_paragraph(self):
        out = io.StringIO()
        with redirect_stdout(out), self.assertRaises(SystemExit):
            uw.main(["--help"])
        self.assertIn("Is the work on this branch in a pull request", out.getvalue())
        self.assertNotIn("Why this exists", out.getvalue())

    def test_cannot_answer_exits_2(self):
        run(self.clone, "checkout", "-q", "--detach", "origin/main")
        err = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(err):
            self.assertEqual(uw.main(["--repo", str(self.clone)]), 2)
        self.assertIn("could not answer", err.getvalue())


if __name__ == "__main__":
    unittest.main()
