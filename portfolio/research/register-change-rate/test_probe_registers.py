#!/usr/bin/env python3
"""Offline tests for probe_registers.py.

No network. Every test drives the derivation half of the probe — the half that
`--recompute-from` uses — with synthetic commit records, so the arithmetic
behind README.md's tables is checkable without cloning anything.

Run: python3 -m unittest discover -s portfolio/research/register-change-rate
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import probe_registers as pr  # noqa: E402

UNTIL = datetime(2026, 8, 20, tzinfo=timezone.utc)
SINCE = UNTIL - timedelta(days=180)


def ts(days_before_end: int) -> int:
    return int((UNTIL - timedelta(days=days_before_end)).timestamp())


def commit(days_before_end: int, *, bot: bool = False, files: int = 1, sha: str = "abc123abc123") -> dict:
    return {"sha": sha, "ts": ts(days_before_end), "bot": bot, "files": files, "top_dirs": ["data"]}


def entry(repo: str, commits: list[dict], status: str = "ok") -> dict:
    return {"repo": repo, "status": status, "error": None, "commits": commits}


def payload(repos: list[dict]) -> dict:
    return {
        "measured_at": UNTIL.isoformat(),
        "window": {
            "days": 180,
            "since": SINCE.date().isoformat(),
            "since_ts": int(SINCE.timestamp()),
            "until_ts": int(UNTIL.timestamp()),
        },
        "repos": repos,
    }


class TestBotDetection(unittest.TestCase):
    def test_recognises_common_automation_identities(self):
        for name, email in [
            ("github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com"),
            ("dependabot", "support@dependabot.com"),
            ("CI", "actions@github.com"),
        ]:
            self.assertTrue(pr.is_bot(name, email), f"{name} <{email}> should read as automation")

    def test_does_not_flag_a_human(self):
        self.assertFalse(pr.is_bot("Ada Lovelace", "ada@example.org"))

    def test_a_sync_account_that_names_itself_a_bot(self):
        # The identity that scored an entirely machine-written mirror at 0%
        # automation on this probe's first run.
        self.assertTrue(pr.is_bot("kev-sync-bot", "actions@users.noreply.github.com"))

    def test_reclassifies_from_a_saved_identity(self):
        row = pr.derive(
            payload([entry("a/b", [dict(commit(3), author="kev-sync-bot <actions@users.noreply.github.com>", bot=False)])])
        )["rows"][0]
        self.assertEqual(row["bot_share"], 1.0, "a saved identity should override the collecting run's verdict")

    def test_falls_back_to_the_saved_verdict_when_no_identity_was_kept(self):
        row = pr.derive(payload([entry("a/b", [commit(3, bot=True)])]))["rows"][0]
        self.assertEqual(row["bot_share"], 1.0)

    def test_bothell_is_not_a_bot(self):
        # The markers are substring matches; a human whose address merely
        # contains the letters would inflate the automation share, which is the
        # direction that would overstate README.md's defensibility reading.
        self.assertFalse(pr.is_bot("Sam Bothell", "sam.bothell@example.org"))


class TestRunTimeout(unittest.TestCase):
    """The clone budget is only a budget if the timeout can actually fire.

    `git clone` forks a `git remote-https` helper that inherits stdout. Killing
    only the direct child leaves the helper holding the pipe, and the cleanup
    `communicate()` blocks forever — which is how a 4-minute per-repo cap became
    a 20-minute one on the first run of this probe.
    """

    def test_timeout_fires_even_when_a_grandchild_holds_the_pipe(self):
        started = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            # The backgrounded sleep inherits stdout and outlives its parent
            # shell, exactly like git's transport helper.
            pr.run(["bash", "-c", "sleep 30 & wait"], timeout=2)
        self.assertLess(time.monotonic() - started, 15, "timeout path blocked on an inherited pipe")

    def test_normal_commands_still_return_output(self):
        rc, out, _ = pr.run(["echo", "still-works"])
        self.assertEqual(rc, 0)
        self.assertEqual(out.strip(), "still-works")


class TestParseLog(unittest.TestCase):
    """The parser is where this probe was wrong first time.

    With a *trailing* record separator, `--name-only` output puts the next
    commit's header at the tail of the previous commit's chunk, so the whole log
    parses as one commit — and a register that changes daily reads as one that
    changed once. These tests pin the separator's position.
    """

    LOG = (
        "\x1eaaaaaaaaaaaaaaaa\x1f1770000000\x1fCI\x1factions@github.com\n"
        "\n"
        "data/2026/one.json\n"
        "data/2026/two.json\n"
        "\x1ebbbbbbbbbbbbbbbb\x1f1769900000\x1fAda\x1fada@example.org\n"
        "\n"
        "tools/build.py\n"
    )

    def test_every_commit_is_recovered(self):
        commits = pr.parse_log(self.LOG)
        self.assertEqual(len(commits), 2)

    def test_files_attach_to_their_own_commit(self):
        first, second = pr.parse_log(self.LOG)
        self.assertEqual(first["files"], 2)
        self.assertEqual(first["top_dirs"], ["data"])
        self.assertEqual(second["files"], 1)
        self.assertEqual(second["top_dirs"], ["tools"])

    def test_author_identity_is_carried_through(self):
        first, second = pr.parse_log(self.LOG)
        self.assertTrue(first["bot"])
        self.assertFalse(second["bot"])

    def test_a_commit_touching_no_files_still_counts(self):
        commits = pr.parse_log("\x1eccccccccccccccc\x1f1770000000\x1fAda\x1fada@example.org\n\n")
        self.assertEqual(len(commits), 1)
        self.assertEqual(commits[0]["files"], 0)

    def test_empty_log_is_not_an_error(self):
        self.assertEqual(pr.parse_log(""), [])

    def test_malformed_headers_are_skipped_not_guessed(self):
        self.assertEqual(pr.parse_log("\x1enot-a-header\nstray/path.json\n"), [])


class TestWindowing(unittest.TestCase):
    def test_commits_outside_the_window_are_excluded(self):
        # The probe deliberately clones 30 days wider than the window.
        rows = pr.derive(payload([entry("a/b", [commit(200), commit(10)])]))["rows"]
        self.assertEqual(rows[0]["commits"], 1)

    def test_change_day_share_counts_distinct_days_not_commits(self):
        same_day = [commit(5, sha=f"sha{i:09d}") for i in range(4)]
        rows = pr.derive(payload([entry("a/b", same_day)]))["rows"]
        self.assertEqual(rows[0]["commits"], 4)
        self.assertEqual(rows[0]["change_days"], 1)


class TestGapArithmetic(unittest.TestCase):
    def test_max_gap_is_the_longest_silence_between_changes(self):
        rows = pr.derive(payload([entry("a/b", [commit(170), commit(100), commit(95)])]))["rows"]
        self.assertEqual(rows[0]["max_gap_days"], 70)
        self.assertEqual(rows[0]["median_gap_days"], 37.5)

    def test_trailing_silence_is_measured_to_the_window_end(self):
        # A monitor's worst case is the gap it is currently sitting in, which
        # no between-changes gap ever captures.
        rows = pr.derive(payload([entry("a/b", [commit(120), commit(90)])]))["rows"]
        self.assertEqual(rows[0]["trailing_silence_days"], 90)

    def test_a_dormant_mirror_reports_a_full_window_of_silence(self):
        rows = pr.derive(payload([entry("a/b", [commit(300)])]))["rows"]
        self.assertEqual(rows[0]["commits"], 0)
        self.assertEqual(rows[0]["trailing_silence_days"], 180)
        self.assertIsNone(rows[0]["last_change"])
        self.assertIsNone(rows[0]["bot_share"])

    def test_single_change_has_no_between_change_gap(self):
        rows = pr.derive(payload([entry("a/b", [commit(30)])]))["rows"]
        self.assertIsNone(rows[0]["max_gap_days"])
        self.assertEqual(rows[0]["trailing_silence_days"], 30)


class TestCadence(unittest.TestCase):
    def test_week_share_never_exceeds_one(self):
        # A 180-day window overlaps 27 ISO weeks, not 180/7 = 25.71 of them.
        # Dividing by the latter reported a register that changed every week as
        # changing in 105% of them.
        daily = [commit(d, sha=f"sha{d:09d}") for d in range(0, 181)]
        row = pr.derive(payload([entry("a/b", daily)]))["rows"][0]
        self.assertLessEqual(row["week_share"], 1.0)
        self.assertEqual(row["change_weeks"], row["weeks_in_window"])

    def test_daily_changes_read_as_weekly_or_better(self):
        daily = [commit(d, sha=f"sha{d:09d}") for d in range(1, 180)]
        rows = pr.derive(payload([entry("a/b", daily)]))["rows"]
        self.assertGreaterEqual(rows[0]["week_share"], 0.95)
        self.assertEqual(pr.derive(payload([entry("a/b", daily)]))["totals"]["changed_in_at_least_half_the_weeks"], 1)

    def test_quarterly_changes_do_not(self):
        rows = pr.derive(payload([entry("a/b", [commit(150), commit(60)])]))["rows"]
        self.assertLess(rows[0]["week_share"], 0.5)


class TestTotals(unittest.TestCase):
    def test_unreachable_and_dormant_are_counted_separately(self):
        totals = pr.derive(
            payload(
                [
                    entry("a/live", [commit(3)]),
                    entry("a/dormant", [commit(400)]),
                    entry("a/gone", [], status="unreachable"),
                ]
            )
        )["totals"]
        self.assertEqual(totals["targets"], 3)
        self.assertEqual(totals["clonable"], 2)
        self.assertEqual(totals["unreachable"], 1)
        self.assertEqual(totals["live_in_window"], 1)
        self.assertEqual(totals["dormant_in_window"], 2)

    def test_fully_bot_maintained_needs_every_commit(self):
        totals = pr.derive(
            payload(
                [
                    entry("a/bot", [commit(3, bot=True), commit(4, bot=True)]),
                    entry("a/mixed", [commit(3, bot=True), commit(4)]),
                ]
            )
        )["totals"]
        self.assertEqual(totals["fully_bot_maintained"], 1)


class TestRecomputeFrom(unittest.TestCase):
    def test_recompute_from_reproduces_the_table_with_no_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "results.json"
            path.write_text(json.dumps(payload([entry("a/b", [commit(3), commit(9)])])))
            proc = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "probe_registers.py"), "--recompute-from", str(path)],
                capture_output=True,
                text=True,
                timeout=60,
            )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("a/b", proc.stdout)
        self.assertIn("targets", proc.stdout)

    def test_saved_results_recompute_if_present(self):
        saved = sorted(Path(__file__).parent.glob("results-*.json"))
        if not saved:
            self.skipTest("no saved results in this checkout")
        derived = pr.derive(json.loads(saved[-1].read_text()))
        self.assertEqual(derived["totals"]["targets"], len(pr.TARGETS))
        for row in derived["rows"]:
            self.assertIn(
                row["status"],
                {"ok", "ok_depth_fallback", "unreachable", "clone_failed", "clone_timeout", "log_failed"},
            )


if __name__ == "__main__":
    unittest.main()
