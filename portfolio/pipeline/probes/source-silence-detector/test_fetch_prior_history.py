#!/usr/bin/env python3
"""Offline tests for the full-history fetcher.

Run: python3 -m unittest discover -s portfolio/pipeline/probes/source-silence-detector

Nothing here touches the network. The clone path is not tested — it is one
`git clone` whose failure modes are recorded rather than handled — but the
derivation and the agreement check are, because those are what decide whether
the fetched history may be spliced onto the saved records at all.
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

import fetch_prior_history as fp


def ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp())


class TestCommitDays(unittest.TestCase):
    def test_days_are_distinct_sorted_and_utc(self):
        got = fp.commit_days([ts("2026-03-02T23:00:00"), ts("2026-03-01T01:00:00"),
                              ts("2026-03-02T04:00:00")])
        self.assertEqual(got, ["2026-03-01", "2026-03-02"])

    def test_no_commits_is_no_days(self):
        self.assertEqual(fp.commit_days([]), [])


class TestWindowBoundary(unittest.TestCase):
    """The bug this check was written to catch, pinned so it cannot come back.

    `register-change-rate`'s `until_ts` is midnight *starting* the window's last
    calendar day. Comparing in-window days as date strings admits that whole
    final day; comparing on the timestamp filter does not. The difference showed
    up as a one-day disagreement on exactly the four mirrors that commit most
    days — the only ones with a commit in that sliver to find.
    """

    def setUp(self):
        self.since, self.until = ts("2026-02-21"), ts("2026-08-20")

    def test_a_commit_later_on_the_final_day_is_outside_the_window(self):
        got = fp.days_in_window([ts("2026-08-20T23:24:30")], self.since, self.until)
        self.assertEqual(got, set())

    def test_midnight_on_the_final_day_is_inside(self):
        got = fp.days_in_window([ts("2026-08-20T00:00:00")], self.since, self.until)
        self.assertEqual(got, {"2026-08-20"})

    def test_both_bounds_are_inclusive_matching_the_source_measurement(self):
        got = fp.days_in_window([self.since, self.until], self.since, self.until)
        self.assertEqual(got, {"2026-02-21", "2026-08-20"})

    def test_commits_before_the_window_are_dropped(self):
        got = fp.days_in_window([ts("2026-02-20T12:00:00")], self.since, self.until)
        self.assertEqual(got, set())


class TestAgreement(unittest.TestCase):
    def setUp(self):
        self.since, self.until = ts("2026-03-01"), ts("2026-03-10")

    def _entry(self, isos: list[str]) -> dict:
        stamps = [ts(i) for i in isos]
        return {"repo": "a/b", "status": "ok", "change_days": fp.commit_days(stamps),
                "_timestamps": stamps}

    def test_identical_days_agree(self):
        entry = self._entry(["2026-03-02T05:00:00", "2026-03-05T06:00:00"])
        got = fp.window_agreement(entry, {"2026-03-02", "2026-03-05"}, self.since, self.until)
        self.assertTrue(got["agrees"])
        self.assertEqual(got["only_here"], [])
        self.assertEqual(got["only_saved"], [])

    def test_an_extra_day_here_is_reported_not_smoothed_over(self):
        entry = self._entry(["2026-03-02T05:00:00", "2026-03-05T06:00:00"])
        got = fp.window_agreement(entry, {"2026-03-02"}, self.since, self.until)
        self.assertFalse(got["agrees"])
        self.assertEqual(got["only_here"], ["2026-03-05"])

    def test_a_day_only_in_the_saved_records_is_reported(self):
        entry = self._entry(["2026-03-02T05:00:00"])
        got = fp.window_agreement(entry, {"2026-03-02", "2026-03-07"}, self.since, self.until)
        self.assertFalse(got["agrees"])
        self.assertEqual(got["only_saved"], ["2026-03-07"])

    def test_pre_window_days_do_not_affect_agreement(self):
        """The whole point: the fetcher adds history outside the window, and that
        addition must not read as a disagreement about the window."""
        entry = self._entry(["2026-01-01T00:00:00", "2026-03-02T05:00:00"])
        got = fp.window_agreement(entry, {"2026-03-02"}, self.since, self.until)
        self.assertTrue(got["agrees"])

    def test_a_failed_fetch_is_not_comparable(self):
        got = fp.window_agreement({"repo": "a/b", "status": "clone_timeout"}, set(),
                                  self.since, self.until)
        self.assertFalse(got["comparable"])
        self.assertEqual(got["reason"], "clone_timeout")


class TestSavedRecords(unittest.TestCase):
    def test_reads_in_window_days_under_the_same_filter(self):
        payload = {
            "window": {"since_ts": ts("2026-03-01"), "until_ts": ts("2026-03-10")},
            "repos": [
                {"repo": "a/b", "status": "ok",
                 "commits": [{"ts": ts("2026-03-05T09:00:00")}, {"ts": ts("2026-02-01")}]},
                {"repo": "c/d", "status": "clone_failed"},
            ],
        }
        got = fp.saved_window_days(payload)
        self.assertEqual(got, {"a/b": {"2026-03-05"}})


class TestSavedFetchIsSelfConsistent(unittest.TestCase):
    """The committed fetch must still describe the window it claims to."""

    @classmethod
    def setUpClass(cls):
        path = Path(__file__).with_name("prior-history-2026-08-21.json")
        if not path.exists():  # pragma: no cover - depends on checkout
            raise unittest.SkipTest(f"missing {path}")
        cls.data = json.loads(path.read_text())

    def test_every_repo_has_history_reaching_back_before_the_window(self):
        since = self.data["window"]["since"]
        for entry in self.data["repos"]:
            with self.subTest(repo=entry["repo"]):
                self.assertEqual(entry["status"], "ok")
                self.assertLess(entry["first_change"], since)

    def test_change_days_are_sorted_and_distinct(self):
        for entry in self.data["repos"]:
            with self.subTest(repo=entry["repo"]):
                days = entry["change_days"]
                self.assertEqual(days, sorted(set(days)))


if __name__ == "__main__":
    unittest.main()
