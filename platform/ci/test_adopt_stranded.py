"""Tests for adopt_stranded.py, against the same throwaway git repositories as
test_unlanded_work.py: a bare "GitHub" with real `refs/pull/<n>/head` refs."""
import io
import json
import os
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

import adopt_stranded as ad
from test_unlanded_work import Fixture, run


class PlanFixture(Fixture):
    def plan(self, **kwargs):
        kwargs.setdefault("min_age_hours", 0)
        return {c.branch: c for c in ad.plan(str(self.clone), probe=self.probe, **kwargs)}

    def stranded(self, name, path, text="x\n", message="x: new venture"):
        self.branch(name)
        self.commit(path, text, message)
        self.push(name)


class TestPlan(PlanFixture):
    def test_new_work_on_a_branch_with_no_pr_is_adopted(self):
        self.stranded("claude/new", "ventures/x/index.html")
        cand = self.plan()["claude/new"]
        self.assertEqual(cand.skip, "")
        self.assertEqual(cand.files, ["ventures/x/index.html"])

    def test_a_young_tip_is_left_to_its_session(self):
        self.stranded("claude/live", "ventures/x/index.html")
        cand = self.plan(min_age_hours=6)["claude/live"]
        self.assertIn("may still be working", cand.skip)

    def test_age_comes_from_the_tip_commit_time(self):
        self.stranded("claude/old", "ventures/x/index.html")
        later = time.time() + 7 * 3600
        cand = self.plan(min_age_hours=6, now=later)["claude/old"]
        self.assertEqual(cand.skip, "")

    def test_run_log_only_branch_is_skipped(self):
        self.stranded("claude/log", "prompts/runs.jsonl", '{"run": 1}\n', "Log run")
        self.assertIn("derived", self.plan()["claude/log"].skip)

    def test_ledger_and_mirror_only_branch_is_skipped(self):
        self.branch("claude/housekeeping")
        self.commit("portfolio/ledger/infra_state.yaml", "a: 1\n", "infra_state: refresh")
        self.commit("gitops/prod/portfolio-front/x.html", "<p>\n", "regen mirror")
        self.push("claude/housekeeping")
        self.assertIn("derived", self.plan()["claude/housekeeping"].skip)

    def test_extra_derived_globs_widen_the_skip(self):
        self.stranded("claude/scaffold", "prompts/routing.json", "{}\n", "Bootstrap prompts/")
        self.assertEqual(self.plan()["claude/scaffold"].skip, "")
        widened = self.plan(derived=ad.DERIVED_GLOBS + ("prompts/*",))
        self.assertIn("derived", widened["claude/scaffold"].skip)

    def test_branch_says_it_was_left_on_purpose(self):
        self.stranded("claude/parked", "ventures/x/index.html",
                      message="x: parked duplicate of #12, not for merge")
        self.assertIn("on purpose", self.plan()["claude/parked"].skip)

    def test_work_landed_through_another_pr_is_skipped(self):
        self.stranded("claude/dup", "ventures/x/index.html", "same\n")
        self.squash_merge("ventures/x/index.html", "same\n", "x: new venture (#9)")
        self.assertIn("already match main", self.plan()["claude/dup"].skip)

    def test_file_main_rewrote_since_is_contested_not_adopted(self):
        # The stale-housekeeping shape: a shared file main has moved on from.
        self.squash_merge("platform/pages/clauses.mjs", "v1\n", "base clauses")
        self.stranded("claude/stale", "platform/pages/clauses.mjs", "v1 + mine\n", "tweak")
        self.squash_merge("platform/pages/clauses.mjs", "v2\n", "someone else's change")
        cand = self.plan()["claude/stale"]
        self.assertIn("probably superseded", cand.skip)
        self.assertIn("platform/pages/clauses.mjs", cand.skip)  # named, not dropped silently

    def test_one_file_only_the_branch_changed_is_enough_to_adopt(self):
        self.squash_merge("platform/pages/clauses.mjs", "v1\n", "base clauses")
        self.branch("claude/page")
        self.commit("platform/pages/clauses.mjs", "v1 + page\n", "register page")
        self.commit("ventures/x/vs-y.html", "<p>\n", "x: comparison page")
        self.push("claude/page")
        self.squash_merge("platform/pages/clauses.mjs", "v2\n", "someone else's change")
        cand = self.plan()["claude/page"]
        self.assertEqual(cand.skip, "")
        self.assertEqual(cand.files, ["ventures/x/vs-y.html"])

    def test_a_tree_sized_branch_is_left_for_a_person(self):
        self.branch("claude/migration")
        for n in range(4):
            self.commit(f"ventures/v{n}/index.html", "x\n", f"move v{n}")
        self.push("claude/migration")
        self.assertIn("migration", self.plan(max_files=3)["claude/migration"].skip)
        self.assertEqual(self.plan(max_files=4)["claude/migration"].skip, "")

    def test_branch_with_an_open_pr_is_not_a_candidate(self):
        self.branch("claude/has-pr")
        sha = self.commit("ventures/x/index.html", "x\n", "x")
        self.push("claude/has-pr")
        self.open_pr(3, sha)
        self.assertNotIn("claude/has-pr", self.plan())


class TestPullRequest(PlanFixture):
    def candidate(self):
        self.stranded("claude/new", "ventures/x/index.html", message="x: " + "long " * 80)
        return self.plan()["claude/new"]

    def test_title_and_body(self):
        cand = self.candidate()
        self.assertTrue(cand.title().startswith("Adopt stranded branch claude/new: x: long"))
        self.assertLessEqual(len(cand.title()), ad.TITLE_LIMIT)
        body = cand.body()
        self.assertIn("ventures/x/index.html", body)
        self.assertIn("CI has not run here yet", body)
        self.assertIn("close it with a one-line reason", body)

    def test_open_draft_posts_a_draft_pr(self):
        cand = self.candidate()
        sent = {}

        class Resp(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        def fake_urlopen(req, timeout):
            sent["url"], sent["payload"] = req.full_url, json.loads(req.data)
            sent["auth"] = req.get_header("Authorization")
            return Resp(json.dumps({"number": 77, "html_url": "https://x/77"}).encode())

        with mock.patch.object(ad.urllib.request, "urlopen", fake_urlopen):
            number, url = ad.open_draft("o/r", "tok", cand, "main")
        self.assertEqual((number, url), (77, "https://x/77"))
        self.assertEqual(sent["url"], "https://api.github.com/repos/o/r/pulls")
        self.assertEqual(sent["auth"], "Bearer tok")
        self.assertTrue(sent["payload"]["draft"])
        self.assertEqual(sent["payload"]["head"], "claude/new")
        self.assertEqual(sent["payload"]["base"], "main")

    def test_apply_without_a_token_refuses(self):
        self.stranded("claude/new", "ventures/x/index.html")
        env = {k: v for k, v in os.environ.items() if k != "GITHUB_TOKEN"}
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(ad.uw, "probe_path", lambda repo: self.probe), \
                redirect_stdout(out), redirect_stderr(err):
            code = ad.main(["--repo", str(self.clone), "--min-age-hours", "0",
                            "--since", "all", "--apply", "--github-repo", "o/r"])
        self.assertEqual(code, 2)
        self.assertIn("needs GITHUB_TOKEN", err.getvalue())
        self.assertIn("ADOPT", out.getvalue())

    def test_actions_forbidden_to_open_prs_stops_with_the_remedy(self):
        self.stranded("claude/a", "ventures/a/index.html")
        self.stranded("claude/b", "ventures/b/index.html")
        calls = []

        def refused(repo, token, cand, base):
            calls.append(cand.branch)
            return None, f"HTTP 403: GitHub Actions is {ad.ACTIONS_MAY_NOT_OPEN_PRS}"

        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"GITHUB_TOKEN": "tok"}), \
                mock.patch.object(ad, "open_draft", refused), \
                mock.patch.object(ad.uw, "probe_path", lambda repo: self.probe), \
                redirect_stdout(out), redirect_stderr(err):
            code = ad.main(["--repo", str(self.clone), "--min-age-hours", "0",
                            "--since", "all", "--apply", "--github-repo", "o/r"])
        self.assertEqual(code, 1)
        self.assertEqual(len(calls), 1)  # it stops instead of failing once per branch
        self.assertIn("Allow GitHub Actions to create and approve pull requests", err.getvalue())

    def test_github_repo_from_remote(self):
        with mock.patch.object(ad.uw, "git", lambda *a, **k: "https://github.com/Own/name.git\n"):
            self.assertEqual(ad.github_repo_from_remote(".", "origin"), "Own/name")
        with mock.patch.object(ad.uw, "git", lambda *a, **k: "http://proxy@127.0.0.1:1/git/Own/name\n"):
            self.assertEqual(ad.github_repo_from_remote(".", "origin"), "Own/name")


if __name__ == "__main__":
    unittest.main()
