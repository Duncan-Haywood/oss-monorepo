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


def run(prs, files=None, checks=None, records=None, main=None):
    by_n = {p["number"]: p for p in prs}
    by_sha = {p["head"]["sha"]: p for p in prs}
    files = files or {}
    checks = checks or {}
    return sp.stalled(
        prs,
        files_of=lambda n: [f if isinstance(f, dict) else {"filename": f}
                            for f in files.get(n, ["ventures/x/a.mjs"])],
        detail_of=lambda n: by_n[n],
        checks_of=lambda sha: checks.get(sha, GREEN),
        head_time_of=lambda sha: NOW - dt.timedelta(hours=by_sha[sha]["_quiet"]),
        rules=RULES, now=NOW,
        record_of=None if records is None else lambda path, sha: records[(path, sha)],
        main_blob=None if main is None else main.get, nap=lambda s: None)


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
        self.assertEqual(self.bucket(rows, 5), "unknown merge",
                         "mergeable None is not computed yet: neither a conflict nor safe to call ready")

    def test_null_mergeable_is_asked_again_until_github_answers(self):
        # 2026-11-19: #17310 read mergeable null once, was listed ready, and was dirty.
        answers = iter([None, None, False])
        naps = []
        got = sp.settled_detail(7, lambda n: {"number": n, "mergeable": next(answers)}, naps.append)
        self.assertIs(got["mergeable"], False)
        self.assertEqual(naps, [2.0, 2.0])
        rows = sp.stalled([pr(8, 5, mergeable=None)], files_of=lambda n: [{"filename": "ventures/x/a.mjs"}],
                          detail_of=lambda n: dict(pr(8, 5), mergeable=False), checks_of=lambda sha: GREEN,
                          head_time_of=lambda sha: NOW - dt.timedelta(hours=5), rules=RULES, now=NOW,
                          nap=lambda s: None)
        self.assertEqual(rows[0]["bucket"], "conflicted")

    def test_known_mergeable_is_read_once(self):
        calls = []
        sp.settled_detail(7, lambda n: calls.append(n) or {"mergeable": True}, lambda s: 1 / 0)
        self.assertEqual(calls, [7])

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

    def test_dead_session_draft_is_unfinished_not_orphan(self):
        # 2026-11-18: #16116/#16245 were listed "mark ready, merge"; their records
        # had outcome null and marking them ready failed promptctl validate.
        rec = "prompts/runs/2026-11-15-session_x.json"
        files = {1: ["ventures/x/a.mjs", rec], 2: ["ventures/x/a.mjs", rec],
                 3: ["ventures/x/a.mjs", rec], 4: [rec]}
        records = {(rec, "s1"): {"outcome": None, "pr": None},
                   (rec, "s2"): {"outcome": "partial"},
                   (rec, "s4"): {"outcome": None}}
        rows = run([pr(1, 30, draft=True), pr(2, 30, draft=True), pr(3, 30, draft=True),
                    pr(4, 5)], files=files, records=records)
        self.assertEqual(self.bucket(rows, 1), "unfinished")
        self.assertEqual(next(r for r in rows if r["number"] == 1)["record"], rec)
        self.assertEqual(self.bucket(rows, 2), "orphan draft", "a filled record is a finished run")
        self.assertEqual(self.bucket(rows, 3), "orphan draft", "an unreadable record changes nothing")
        self.assertEqual(self.bucket(rows, 4), "unfinished", "non-drafts too: CI would be red")
        self.assertIn("## unfinished (2)", sp.render(rows))

    def test_unfinished_needs_a_record_and_a_reader(self):
        rec = "prompts/runs/r.json"
        self.assertEqual(self.bucket(run([pr(1, 30, draft=True)], files={1: [rec]}), 1),
                         "orphan draft", "no record_of: the old buckets stand")
        rows = run([pr(1, 30, draft=True), pr(2, 50, title="parked: x")],
                   files={1: ["prompts/runs/sub/r.json"], 2: [rec]},
                   records={(rec, "s2"): {"outcome": None}})
        self.assertEqual(self.bucket(rows, 1), "orphan draft", "only top-level records count")
        self.assertEqual(self.bucket(rows, 2), "blocked", "a named blocker still wins")

    def test_removed_record_is_ignored(self):
        self.assertIsNone(sp.unfinished_record(
            [{"filename": "prompts/runs/r.json", "status": "removed"}], "s",
            lambda p, s: {"outcome": None}))

    def test_work_already_on_main_is_landed(self):
        # 2026-11-18: #8720 sat 29 days as "ready" with 57 of 62 files already on main.
        files = {1: [{"filename": f"r/f{i}.py", "sha": f"b{i}"} for i in range(5)]}
        main = {f"r/f{i}.py": f"b{i}" for i in range(4)} | {"r/f4.py": "newer"}
        rows = run([pr(1, 72)], files=files, main=main)
        self.assertEqual((rows[0]["bucket"], rows[0]["on_main"]), ("landed", "4/5"))
        self.assertIn("(4/5 identical on main)", sp.render(rows))

    def test_a_file_main_lacks_or_too_few_identical_is_not_landed(self):
        files = {1: [{"filename": "r/a.py", "sha": "x"}, {"filename": "r/new.py", "sha": "y"}],
                 2: [{"filename": f"r/f{i}.py", "sha": f"b{i}"} for i in range(5)],
                 3: [{"filename": "r/gone.py", "sha": "z", "status": "removed"}]}
        main = {"r/a.py": "x"} | {f"r/f{i}.py": ("b0" if i == 0 else "old") for i in range(5)}
        rows = run([pr(1, 72), pr(2, 72), pr(3, 72)], files=files, main=main)
        self.assertEqual([r["bucket"] for r in rows], ["ready"] * 3)
        self.assertNotIn("on_main", rows[0])
        self.assertEqual(rows[1]["on_main"], "1/5")

    def test_blocked_stays_blocked_and_no_reader_means_no_check(self):
        files = {1: [{"filename": "r/a.py", "sha": "x"}]}
        rows = run([pr(1, 72, title="parked: x")], files=files, main={"r/a.py": "x"})
        self.assertEqual(rows[0]["bucket"], "blocked")
        self.assertEqual(run([pr(1, 72)], files=files)[0]["bucket"], "ready")

    def test_main_blobs_reads_this_clone(self):
        blobs = sp.main_blobs("HEAD")
        self.assertIn("platform/ci/stalled_prs.py", blobs)
        self.assertEqual(sp.main_blobs("no-such-ref-xyz"), {})

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
