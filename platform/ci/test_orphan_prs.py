#!/usr/bin/env python3
"""Tests for orphan_prs: which open PRs any agent may land now.

The list is only useful if it leaves out what land-your-work.md says to leave:
fork PRs, PRs that touch an owned path (owner_held_prs.py lists those), PRs
pushed to within the stall threshold (2 h ready, 24 h draft), and PRs whose
body says they are open on purpose. Get one of those wrong and an agent merges
work its author is still writing, or a gated change.
"""

import datetime as dt
import unittest

import control_plane_guard as cpg
import orphan_prs as op

RULES = cpg.parse_codeowners("/prompts/ @owner\n/prompts/runs/\n/.github/ @owner\n")
NOW = dt.datetime(2026, 11, 13, 12, 0, tzinfo=dt.timezone.utc)


def ago(hours):
    return (NOW - dt.timedelta(hours=hours)).isoformat().replace("+00:00", "Z")


def pr(n, pushed_h, draft=False, fork=False, body="", updated_h=None):
    return {"number": n, "title": f"pr {n}", "draft": draft, "body": body,
            "updated_at": ago(pushed_h if updated_h is None else updated_h),
            "head": {"repo": {"full_name": "x/r" if fork else "o/r"}, "ref": f"b{n}", "sha": f"s{n}"},
            "base": {"repo": {"full_name": "o/r"}}, "_pushed": ago(pushed_h)}


def f(name, sha="x"):
    return {"filename": name, "sha": sha, "status": "modified"}


FILES = {
    1: [f("ventures/a/index.html")],          # ready, idle 5 h: listed
    2: [f("ventures/b/index.html")],          # ready, idle 1 h: too fresh
    3: [f("ventures/c/index.html")],          # draft, idle 10 h: too fresh
    4: [f("ventures/d/index.html")],          # draft, idle 30 h: orphan, listed
    5: [f(".github/workflows/x.yml")],        # owned: owner_held_prs's list
    6: [f("ventures/e/index.html")],          # fork: never
    7: [f("prompts/runs/r.json")],            # unowned by the later rule: listed
    8: [f("ventures/f/index.html")],          # says parked: listed apart
    9: [f("docs/posts/p.md", "main-blob")],   # same blob as main
}


class Main:
    def blob(self, path):
        return "main-blob" if path == "docs/posts/p.md" else None

    def text(self, path):
        return None


def info_of(p):
    return {"files": FILES[p["number"]], "pushed_at": p["_pushed"], "checks": [{"status": "completed", "conclusion": "success"}]}


PRS = [pr(1, 5), pr(2, 1), pr(3, 10, draft=True), pr(4, 30, draft=True), pr(5, 50), pr(6, 50, fork=True),
       pr(7, 3), pr(8, 40, body="Parked: not for merge until the data lands."), pr(9, 4)]


class Classify(unittest.TestCase):
    def setUp(self):
        self.rows = op.classify(PRS, info_of, RULES, NOW, Main())
        self.by = {r["number"]: r for r in self.rows}

    def test_thresholds_owned_and_forks(self):
        self.assertEqual(sorted(self.by), [1, 4, 7, 8, 9])

    def test_stalest_first(self):
        self.assertEqual([r["number"] for r in self.rows], [8, 4, 1, 9, 7])

    def test_says_wait_and_on_main(self):
        self.assertTrue(self.by[8]["says_wait"])
        self.assertFalse(self.by[1]["says_wait"])
        self.assertTrue(self.by[9]["on_main"])
        self.assertFalse(self.by[1]["on_main"])

    def test_recently_updated_skips_requests(self):
        asked = []
        op.classify([pr(1, 50, updated_h=0.5)], lambda p: asked.append(p) or info_of(p), RULES, NOW)
        self.assertEqual(asked, [])

    def test_pushed_at_wins_over_updated_at(self):
        # A comment yesterday moves updated_at; the head commit is what says stalled.
        fresh_push = pr(1, 1, updated_h=30)
        self.assertEqual(op.classify([fresh_push], info_of, RULES, NOW), [])

    def test_render(self):
        text = op.render(self.rows)
        self.assertIn("#4", text)
        self.assertIn("(draft) pr 4", text)
        self.assertIn("already on main", text)
        self.assertIn("Left open on purpose", text)
        self.assertNotIn("| #8 |", text)
        self.assertIn("nothing for another agent", op.render([]))


class Checks(unittest.TestCase):
    def test_summary(self):
        ok = {"status": "completed", "conclusion": "success"}
        self.assertEqual(op.checks_summary([]), "none")
        self.assertEqual(op.checks_summary([ok]), "green")
        self.assertEqual(op.checks_summary([ok, {"status": "in_progress", "conclusion": None}]), "pending")
        self.assertEqual(op.checks_summary([ok, {"status": "completed", "conclusion": "failure"}]), "red")
        self.assertEqual(op.checks_summary([ok, {"status": "completed", "conclusion": "skipped"}]), "green")


if __name__ == "__main__":
    unittest.main()
