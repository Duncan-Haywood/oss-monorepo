"""Tests for derive.py: PR references, CI summaries, rework from git, and measure's fallback."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import derive
import promptctl


def _git(cwd: Path, *args: str, when: str | None = None) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
    if when:
        env.update(GIT_AUTHOR_DATE=when, GIT_COMMITTER_DATE=when)
    return subprocess.run(["git", *args], cwd=cwd, env=env, check=True,
                          capture_output=True, text=True).stdout.strip()


class ParsePrTest(unittest.TestCase):
    def test_forms(self) -> None:
        self.assertEqual(derive.parse_pr({"pr": "https://github.com/a/b/pull/12"}), ("a/b", 12))
        self.assertEqual(derive.parse_pr({"pr": 7}), (derive.HOME_REPO, 7))
        self.assertEqual(derive.parse_pr({"pr": "#7", "repo": "x/y"}), ("x/y", 7))
        self.assertEqual(derive.parse_pr({"pr": 7, "source": promptctl.MIRRORED_RUNS_SOURCE}),
                         (derive.RESEARCH_REPO, 7))
        for bad in (None, True, 0, "soon", ["#1"]):
            self.assertIsNone(derive.parse_pr({"pr": bad}))


class CiSummaryTest(unittest.TestCase):
    def test_red_then_green(self) -> None:
        red = [{"status": "completed", "conclusion": "failure"},
               {"status": "completed", "conclusion": "success"}]
        green = [{"status": "completed", "conclusion": "success"},
                 {"status": "completed", "conclusion": "cancelled"}]
        s = derive.ci_summary([red, [], green])
        self.assertEqual((s["commits_checked"], s["red_commits"], s["unchecked_commits"], s["head"]),
                         (3, 1, 1, "green"))
        self.assertEqual(derive.ci_summary([[{"status": "in_progress"}]])["head"], "pending")
        self.assertEqual(derive.ci_summary([])["head"], "none")

    def test_fetch_pr_uses_the_api_shape(self) -> None:
        pages = {
            "/repos/a/b/pulls/3": {"state": "closed", "merged": True, "created_at": "2026-10-01T00:00:00Z",
                                   "merged_at": "2026-10-01T02:00:00Z", "additions": 5, "deletions": 1,
                                   "changed_files": 2, "commits": 2, "merge_commit_sha": "abc",
                                   "base": {"ref": "main"},
                                   "head": {"sha": "h", "repo": {"full_name": "A/B"}}},
            "/repos/a/b/pulls/3/commits?per_page=100": [{"sha": "c1"}, {"sha": "c2"}],
            "/repos/a/b/commits/c1/check-runs?per_page=100&page=1":
                {"check_runs": [{"status": "completed", "conclusion": "failure"}]},
            "/repos/a/b/commits/c2/check-runs?per_page=100&page=1":
                {"check_runs": [{"status": "completed", "conclusion": "success"}]},
        }
        facts = derive.fetch_pr("a/b", 3, pages.get)
        self.assertTrue(facts["same_repo"])
        self.assertEqual((facts["ci"]["red_commits"], facts["ci"]["head"]), (1, "green"))
        self.assertTrue(derive.is_final(facts))
        self.assertIsNone(derive.fetch_pr("a/b", 4, pages.get))


class ReworkTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        _git(self.repo, "init", "-q", "-b", "main")
        (self.repo / "a.py").write_text("base\n")
        _git(self.repo, "add", ".")
        _git(self.repo, "commit", "-qm", "base", when="2026-09-01T00:00:00Z")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def commit(self, text: str, msg: str, when: str, path: str = "a.py") -> str:
        (self.repo / path).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / path).write_text(text)
        _git(self.repo, "add", ".")
        _git(self.repo, "commit", "-qm", msg, when=when)
        return _git(self.repo, "rev-parse", "HEAD")

    def test_survival_followups_and_excluded_paths(self) -> None:
        pr = self.commit("base\none\ntwo\nthree\nfour\n", "feature (#5)", "2026-09-02T00:00:00Z")
        self.commit("base\none\ntwo\nTHREE\nFOUR\n", "fix the feature from #5", "2026-09-05T00:00:00Z")
        self.commit("x\n", "regen", "2026-09-06T00:00:00Z", path="prompts/runs/r.json")
        self.commit("base\n", "rewrite after the window", "2026-10-01T00:00:00Z")
        r = derive.rework(pr, 5, "2026-09-02T00:00:00Z", "main", self.repo,
                          now=datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertEqual(r["window"], "closed")
        self.assertEqual((r["lines_added"], r["lines_alive"], r["survival"]), (4, 2, 0.5))
        self.assertEqual((r["reverted"], r["followups"]), (0, 1))

    def test_revert_and_open_window(self) -> None:
        pr = self.commit("base\nnew\n", "feature (#6)", "2026-09-02T00:00:00Z")
        _git(self.repo, "revert", "--no-edit", pr, when="2026-09-03T00:00:00Z")
        self.commit("later\n", "after the window", "2026-10-01T00:00:00Z", path="b.py")
        r = derive.rework(pr, 6, "2026-09-02T00:00:00Z", "main", self.repo,
                          now=datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertEqual((r["reverted"], r["survival"]), (1, 0.0))
        early = derive.rework(pr, 6, "2026-09-02T00:00:00Z", "main", self.repo,
                              now=datetime(2026, 9, 10, tzinfo=timezone.utc))
        self.assertEqual(early["window"], "open")
        self.assertEqual(derive.rework("0" * 40, 6, "2026-09-02T00:00:00Z", "main", self.repo,
                                       now=datetime(2026, 10, 16, tzinfo=timezone.utc))["window"],
                         "unavailable")


    def test_window_past_the_branch_tip_stays_open(self) -> None:
        pr = self.commit("base\nnew\n", "feature (#7)", "2026-09-02T00:00:00Z")
        r = derive.rework(pr, 7, "2026-09-02T00:00:00Z", "main", self.repo,
                          now=datetime(2026, 10, 16, tzinfo=timezone.utc))
        self.assertEqual(r["window"], "open")

    def test_excluded_paths(self) -> None:
        self.assertTrue(derive.excluded("gitops/prod/x.yaml"))
        self.assertTrue(derive.excluded("web/package-lock.json"))
        self.assertFalse(derive.excluded("research/p/model.py"))
        self.assertTrue(derive.excluded("research/p/model.py", mirrored=True))


class FetchForbiddenTest(unittest.TestCase):
    def test_403_keeps_the_cache_and_does_not_raise(self) -> None:
        def forbidden(path: str) -> None:
            raise derive.urllib.error.URLError("403")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "prompts"
            (root / "runs").mkdir(parents=True)
            rec = {**promptctl.RECORD_FIELDS, "date": "2026-10-01", "session": "s", "track": "ventures",
                   "prompt_version": 1, "outcome": "success", "pr": 9}
            (root / "runs" / "2026-10-01-s.json").write_text(json.dumps(rec))
            logs: list[str] = []
            cache = derive.fetch(root, get=forbidden, log=logs.append)
            self.assertEqual(cache, {})
            self.assertTrue(any("could not be fetched" in m for m in logs))


class MeasureFallbackTest(unittest.TestCase):
    def test_measured_merged_fills_a_null(self) -> None:
        recs = [{"outcome": "success", "merged": None, "_measured": {"merged": False}},
                {"outcome": "success", "merged": None, "_measured": {"merged": True, "rework": {
                    "window": "closed", "reverted": 1, "followups": 0, "survival": 0.25}}},
                {"outcome": "success", "merged": True, "_measured": {"merged": False}},
                {"outcome": "success", "merged": None}]
        s = promptctl.summarise(recs)
        self.assertEqual((s["success"], s["leaked"], s["merged_unknown"]), (3, 1, 1))
        self.assertEqual((s["rework_measured"], s["reverted"], s["survival_median"]), (1, 1, 0.25))

    def test_build_and_load(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "prompts"
            (root / "runs").mkdir(parents=True)
            rec = {**promptctl.RECORD_FIELDS, "date": "2026-10-01", "session": "s", "track": "ventures",
                   "prompt_version": 1, "outcome": "success", "pr": 9}
            (root / "runs" / "2026-10-01-s.json").write_text(json.dumps(rec))
            (root / "runs" / "2026-10-01-t.json").write_text(json.dumps({**rec, "pr": None}))
            derive.write_json(root / "derived" / "github.json", {derive.key(derive.HOME_REPO, 9): {
                "state": "closed", "merged": False, "created_at": "2026-10-01T00:00:00Z",
                "closed_at": "2026-10-01T03:00:00Z", "ci": {"red_commits": 2, "head": "red"}}})
            derive.build(root, cwd=Path(tmp))
            got = derive.load_measured(root)
            self.assertEqual((got["2026-10-01-s.json"]["merged"], got["2026-10-01-s.json"]["hours_open"],
                              got["2026-10-01-s.json"]["ci_red_commits"]), (False, 3.0, 2))
            self.assertIn("names no pull request", got["2026-10-01-t.json"]["why"])
            self.assertIn("1 closed unmerged", derive.report(root))


if __name__ == "__main__":
    unittest.main()
