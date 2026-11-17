#!/usr/bin/env python3
"""Tests for stalled_prs: which open PRs another session may land, and how.

If the buckets were wrong, a session would merge a draft still being written,
a PR its author parked on purpose, or a PR waiting on the owner; or it would
skip a green PR nobody is coming back for.
"""

import datetime as dt
import unittest

import control_plane_guard as cpg
import stalled_prs as sp

RULES = cpg.parse_codeowners("/prompts/ @owner\n/prompts/runs/\n/.github/ @owner\n")
NOW = dt.datetime(2026, 11, 17, 14, tzinfo=dt.timezone.utc)


def pr(n, hours_quiet, draft=False, title=None, body="", mergeable=True, fork=False):
    repo = {"full_name": "o/r"}
    return {"number": n, "title": title or f"pr {n}", "body": body, "draft": draft,
            "mergeable": mergeable, "created_at": f"2026-11-{n % 28 + 1:02d}T00:00:00Z",
            "head": {"sha": f"s{n}", "ref": f"b{n}", "repo": {"full_name": "x/r"} if fork else repo},
            "base": {"repo": repo}, "_quiet": hours_quiet}


GREEN = [{"status": "completed", "conclusion": "success"},
         {"status": "completed", "conclusion": "skipped"}]


def run(prs, files=None, checks=None):
    by_n = {p["number"]: p for p in prs}
    by_sha = {p["head"]["sha"]: p for p in prs}
    files = files or {}
    checks = checks or {}
    return sp.stalled(
        prs,
        files_of=lambda n: [{"filename": f} for f in files.get(n, ["ventures/x/a.mjs"])],
        detail_of=lambda n: by_n[n],
        checks_of=lambda sha: checks.get(sha, GREEN),
        head_time_of=lambda sha: NOW - dt.timedelta(hours=by_sha[sha]["_quiet"]),
        rules=RULES, now=NOW)


class ChecksState(unittest.TestCase):
    def test_states(self):
        self.assertEqual(sp.checks_state([]), "none")
        self.assertEqual(sp.checks_state(GREEN), "green")
        self.assertEqual(sp.checks_state(GREEN + [{"status": "in_progress"}]), "pending")
        self.assertEqual(sp.checks_state(GREEN + [{"status": "completed", "conclusion": "failure"}]), "red")
        self.assertEqual(sp.checks_state([{"status": "completed", "conclusion": "cancelled"}]), "red")


class Buckets(unittest.TestCase):
    def bucket(self, rows, n):
        return next((r["bucket"] for r in rows if r["number"] == n), None)

    def test_ready_needs_two_quiet_hours(self):
        rows = run([pr(1, 3), pr(2, 1)])
        self.assertEqual(self.bucket(rows, 1), "ready")
        self.assertIsNone(self.bucket(rows, 2), "a PR pushed an hour ago is still its author's")

    def test_draft_needs_a_quiet_day(self):
        rows = run([pr(1, 25, draft=True), pr(2, 10, draft=True)])
        self.assertEqual(self.bucket(rows, 1), "orphan draft")
        self.assertIsNone(self.bucket(rows, 2))

    def test_red_pending_none_and_conflicted(self):
        rows = run([pr(1, 5), pr(2, 5), pr(3, 5), pr(4, 5, mergeable=False), pr(5, 5, mergeable=None)],
                   checks={"s1": [{"status": "completed", "conclusion": "failure"}],
                           "s2": [{"status": "queued"}], "s3": []})
        self.assertEqual(self.bucket(rows, 1), "red")
        self.assertEqual(self.bucket(rows, 2), "pending")
        self.assertEqual(self.bucket(rows, 3), "no checks")
        self.assertEqual(self.bucket(rows, 4), "conflicted")
        self.assertEqual(self.bucket(rows, 5), "ready", "mergeable None is not yet computed, not a conflict")

    def test_named_blocker_is_left_alone(self):
        rows = run([pr(1, 50, title="Parked: x (do not merge as-is)"),
                    pr(2, 50, body="Waiting on the owner for the token."),
                    pr(3, 1, draft=True, title="research: milestone 4 [in progress]")])
        self.assertEqual([self.bucket(rows, n) for n in (1, 2, 3)], ["blocked"] * 3)

    def test_owned_and_fork_prs_are_left_out(self):
        rows = run([pr(1, 50), pr(2, 50), pr(3, 50, fork=True)],
                   files={1: ["prompts/goals.md", "ventures/x/a.mjs"], 2: ["prompts/runs/r.json"]})
        self.assertIsNone(self.bucket(rows, 1), "touches an owned path: owner_held_prs.py lists it")
        self.assertEqual(self.bucket(rows, 2), "ready", "prompts/runs/ is unowned")
        self.assertIsNone(self.bucket(rows, 3), "fork PRs are never merged here")

    def test_order_ready_first_then_oldest(self):
        rows = run([pr(3, 30, draft=True), pr(2, 5), pr(1, 5)])
        self.assertEqual([r["number"] for r in rows], [1, 2, 3])

    def test_render(self):
        text = sp.render(run([pr(1, 72), pr(2, 30, draft=True)]))
        self.assertIn("## ready (1)", text)
        self.assertIn("| #1 | 3 d |", text)
        self.assertIn("## orphan draft (1)", text)
        self.assertIn("No stalled", sp.render([]))


if __name__ == "__main__":
    unittest.main()
