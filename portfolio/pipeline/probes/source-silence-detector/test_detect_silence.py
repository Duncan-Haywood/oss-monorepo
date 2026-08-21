#!/usr/bin/env python3
"""Offline tests for the silence detector.

Run: python3 -m unittest discover -s portfolio/pipeline/probes/source-silence-detector

Two kinds of test live here. Most are unit tests over synthetic histories, where
the expected answer is obvious by construction. The last class pins the headline
numbers against the real saved measurement, so that a later edit that quietly
changes the finding fails here rather than in a document nobody re-runs.
"""

from __future__ import annotations

import json
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import detect_silence as ds

DAY = 86400


def ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp())


def payload(repos: dict[str, list[str]], since: str, until: str) -> dict:
    return {
        "measured_at": f"{until}T00:00:00+00:00",
        "window": {"since_ts": ts(since), "until_ts": ts(until)},
        "repos": [
            {"repo": name, "status": "ok", "commits": [{"ts": ts(d), "files": 1} for d in days]}
            for name, days in repos.items()
        ],
    }


class TestWindowing(unittest.TestCase):
    def test_change_days_are_distinct_and_sorted(self):
        commits = [{"ts": ts("2026-03-02")}, {"ts": ts("2026-03-01")}, {"ts": ts("2026-03-02")}]
        got = ds.change_days(commits, ts("2026-01-01"), ts("2026-12-31"))
        self.assertEqual(got, [date(2026, 3, 1), date(2026, 3, 2)])

    def test_window_bounds_are_inclusive_matching_the_source_measurement(self):
        """probe_registers.summarise uses `since_ts <= ts <= until_ts`; disagreeing
        here would make the two files describe different commit sets."""
        since, until = ts("2026-03-01"), ts("2026-03-10")
        commits = [{"ts": since}, {"ts": until}]
        self.assertEqual(len(ds.change_days(commits, since, until)), 2)

    def test_commits_outside_the_window_are_dropped(self):
        commits = [{"ts": ts("2026-02-28")}, {"ts": ts("2026-03-05")}, {"ts": ts("2026-03-20")}]
        got = ds.change_days(commits, ts("2026-03-01"), ts("2026-03-10"))
        self.assertEqual(got, [date(2026, 3, 5)])


class TestThreshold(unittest.TestCase):
    def test_gaps_between_consecutive_days(self):
        days = [date(2026, 3, 1), date(2026, 3, 4), date(2026, 3, 5)]
        self.assertEqual(ds.gaps_between(days), [3, 1])

    def test_no_threshold_below_min_gaps(self):
        cfg = ds.Config(min_gaps=5)
        self.assertIsNone(ds.cadence_threshold([1, 2, 3, 4], cfg))
        self.assertIsNotNone(ds.cadence_threshold([1, 2, 3, 4, 5], cfg))

    def test_threshold_is_ceil_of_worst_gap_times_multiplier(self):
        cfg = ds.Config(min_gaps=1, multiplier=1.5, floor_days=0)
        self.assertEqual(ds.cadence_threshold([2, 5], cfg), 8)  # ceil(5 * 1.5)

    def test_floor_wins_for_fast_sources(self):
        """A daily register must not page a human because it is one day late."""
        cfg = ds.Config(min_gaps=1, multiplier=1.5, floor_days=7)
        self.assertEqual(ds.cadence_threshold([1, 1, 1], cfg), 7)

    def test_threshold_is_anchored_on_worst_not_median(self):
        """congress-legislators has a normal 49-day gap; a median-anchored rule
        would alarm on it every time."""
        cfg = ds.Config(min_gaps=1, multiplier=1.0, floor_days=0)
        self.assertEqual(ds.cadence_threshold([1, 1, 1, 1, 49], cfg), 49)


class TestNoLookahead(unittest.TestCase):
    def test_future_changes_cannot_raise_todays_threshold(self):
        """The whole point of a walk-forward backtest: on 2026-03-20 the detector
        must not know about a 40-day gap that only happens in May."""
        days = [date(2026, 3, 1), date(2026, 3, 2), date(2026, 3, 3), date(2026, 3, 4),
                date(2026, 3, 5), date(2026, 3, 6), date(2026, 5, 20)]
        cfg = ds.Config(min_gaps=5, multiplier=1.0, floor_days=1, warmup_days=0)
        r = ds.evaluate_source(days, date(2026, 3, 1), date(2026, 3, 25), cfg)
        # Only 1-day gaps are visible by 2026-03-25, so a 19-day silence alarms.
        self.assertTrue(r["alarms"])
        self.assertTrue(all(a["threshold"] <= 1 for a in r["alarms"]))


class TestAlarmClassification(unittest.TestCase):
    def _run(self, days, since, until, **kw):
        cfg = ds.Config(min_gaps=1, multiplier=1.0, floor_days=1, warmup_days=0, **kw)
        return ds.evaluate_source(days, since, until, cfg)

    def test_terminal_alarm_when_source_never_returns(self):
        days = [date(2026, 3, 1), date(2026, 3, 3)]
        r = self._run(days, date(2026, 3, 1), date(2026, 3, 30))
        self.assertTrue(r["detected_terminal_silence"])
        self.assertEqual(r["mid_window_alarm_days"], 0)

    def test_resolved_alarm_when_source_comes_back(self):
        days = [date(2026, 3, 1), date(2026, 3, 3), date(2026, 3, 20), date(2026, 3, 21)]
        r = self._run(days, date(2026, 3, 1), date(2026, 3, 21))
        self.assertFalse(r["detected_terminal_silence"])
        self.assertGreater(r["mid_window_alarm_days"], 0)

    def test_detection_latency_measured_from_last_change(self):
        days = [date(2026, 3, 1), date(2026, 3, 2), date(2026, 3, 3)]
        r = self._run(days, date(2026, 3, 1), date(2026, 3, 30))
        # threshold is 1 day, so the first alarm is 2 days after the last change.
        self.assertEqual(r["detection_latency_days"], 2)

    def test_cold_start_alarms_are_counted_separately(self):
        """Alarms before the first observed change are an artifact of the shallow
        clone, not evidence about the detector."""
        days = [date(2026, 4, 1), date(2026, 4, 2), date(2026, 4, 3)]
        cfg = ds.Config(min_gaps=1, warmup_days=0, fallback="fixed", fallback_days=5)
        r = ds.evaluate_source(days, date(2026, 3, 1), date(2026, 4, 3), cfg)
        self.assertGreater(r["cold_start_alarm_days"], 0)
        self.assertEqual(r["mid_window_alarm_days"], 0)

    def test_warmup_suppresses_alarms(self):
        days = [date(2026, 3, 1), date(2026, 3, 2)]
        cfg = ds.Config(min_gaps=1, multiplier=1.0, floor_days=1, warmup_days=90)
        r = ds.evaluate_source(days, date(2026, 3, 1), date(2026, 3, 30), cfg)
        self.assertEqual(r["alarms"], [])


class TestGroundTruth(unittest.TestCase):
    def test_quiet_flag_uses_trailing_silence_not_a_hand_label(self):
        days = [date(2026, 3, 1)]
        cfg = ds.Config()
        quiet = ds.evaluate_source(days, date(2026, 3, 1), date(2026, 6, 1), cfg)
        live = ds.evaluate_source(days, date(2026, 3, 1), date(2026, 3, 2), cfg)
        self.assertTrue(quiet["quiet_at_window_end"])
        self.assertFalse(live["quiet_at_window_end"])
        self.assertEqual(quiet["trailing_silence_days"], 92)


class TestFallbacks(unittest.TestCase):
    def setUp(self):
        # One fast source that changes daily right up to the window's end, and one
        # two-commit source that cannot be calibrated and then dies — the shape of
        # the real finding. The live source has to stay live all the way to the
        # end, or it counts as quiet itself and the fixture proves nothing.
        start, end = date(2026, 3, 1), date(2026, 6, 1)
        fast = [(start + timedelta(days=n)).isoformat() for n in range((end - start).days + 1)]
        self.p = payload({"fast/live": fast, "thin/dead": ["2026-03-01", "2026-03-04"]},
                         start.isoformat(), end.isoformat())

    def test_per_source_only_misses_the_uncalibrated_dead_source(self):
        r = ds.evaluate_all(self.p, ds.Config(fallback="none"))
        self.assertEqual(r["totals"]["quiet_at_window_end"], 1)
        self.assertEqual(r["totals"]["detected_terminal_silence"], 0)
        self.assertEqual(r["totals"]["missed_quiet_sources"], ["thin/dead"])

    def test_fixed_fallback_catches_it(self):
        r = ds.evaluate_all(self.p, ds.Config(fallback="fixed", fallback_days=30))
        self.assertEqual(r["totals"]["detected_terminal_silence"], 1)

    def test_pooled_fallback_catches_it(self):
        r = ds.evaluate_all(self.p, ds.Config(fallback="pooled"))
        self.assertEqual(r["totals"]["detected_terminal_silence"], 1)

    def test_pooled_threshold_ignores_uncalibratable_peers(self):
        cfg = ds.Config(floor_days=1)
        self.assertIsNone(ds._pooled_threshold([None, None], cfg))
        self.assertEqual(ds._pooled_threshold([None, 10, 20, 30], cfg), 20)


class TestHeadlineNumbersAgainstRealData(unittest.TestCase):
    """Pins the finding this probe exists to report, against the saved records."""

    @classmethod
    def setUpClass(cls):
        if not ds.DEFAULT_RESULTS.exists():  # pragma: no cover - depends on checkout
            raise unittest.SkipTest(f"missing {ds.DEFAULT_RESULTS}")
        cls.payload = json.loads(ds.DEFAULT_RESULTS.read_text())

    def test_two_sources_went_quiet_and_both_are_the_known_controls(self):
        r = ds.evaluate_all(self.payload, ds.Config())
        self.assertEqual(r["totals"]["quiet_sources"], ["FDA/openfda", "datasets/covid-19"])

    def test_exactly_the_quiet_sources_are_the_uncalibratable_ones(self):
        """The finding in one assertion: the per-source threshold is undefined on
        precisely the sources it was needed for."""
        r = ds.evaluate_all(self.payload, ds.Config())
        self.assertEqual(r["totals"]["never_calibrated"], r["totals"]["quiet_sources"])

    def test_per_source_rule_alone_catches_nothing_at_any_setting(self):
        for multiplier in (1.0, 1.5, 2.0, 3.0):
            for min_gaps in (2, 5, 10):
                cfg = ds.Config(multiplier=multiplier, min_gaps=min_gaps, fallback="none")
                r = ds.evaluate_all(self.payload, cfg)
                with self.subTest(multiplier=multiplier, min_gaps=min_gaps):
                    self.assertEqual(r["totals"]["detected_terminal_silence"], 0)
                    self.assertEqual(len(r["totals"]["never_calibrated"]), 2)

    def test_a_fallback_catches_both_at_every_setting(self):
        for fallback in ("fixed", "pooled"):
            for multiplier in (1.0, 1.5, 2.0, 3.0):
                cfg = ds.Config(multiplier=multiplier, fallback=fallback)
                r = ds.evaluate_all(self.payload, cfg)
                with self.subTest(fallback=fallback, multiplier=multiplier):
                    self.assertEqual(r["totals"]["detected_terminal_silence"], 2)

    def test_pooled_detects_faster_than_a_fixed_thirty_day_rule(self):
        pooled = ds.evaluate_all(self.payload, ds.Config(fallback="pooled"))
        fixed = ds.evaluate_all(self.payload, ds.Config(fallback="fixed", fallback_days=30))
        for repo in pooled["totals"]["quiet_sources"]:
            with self.subTest(repo=repo):
                self.assertLess(
                    pooled["sources"][repo]["detection_latency_days"],
                    fixed["sources"][repo]["detection_latency_days"],
                )

    def test_live_fast_sources_never_produce_a_nuisance_alarm(self):
        """The three daily software-security registers are the ones a customer
        would actually be paying for; a detector that pages on them is unusable."""
        r = ds.evaluate_all(self.payload, ds.Config(fallback="pooled"))
        for repo in ("github/advisory-database", "ossf/malicious-packages", "cisagov/kev-data"):
            with self.subTest(repo=repo):
                self.assertEqual(r["sources"][repo]["mid_window_alarm_days"], 0)

    def test_render_runs_and_names_every_source(self):
        text = ds.render(ds.evaluate_all(self.payload, ds.Config()))
        for repo in ("FDA/openfda", "cisagov/kev-data", "unitedstates/congress-legislators"):
            self.assertIn(repo, text)


if __name__ == "__main__":
    unittest.main()
