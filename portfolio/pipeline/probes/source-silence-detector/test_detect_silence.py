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


# ---------------------------------------------------------------------------
# Full-history calibration (the 2026-08-21 amendment)
# ---------------------------------------------------------------------------


def prior(repos: dict[str, list[str]], since_ts: int, until_ts: int) -> dict:
    """A `fetch_prior_history.py`-shaped payload, agreeing by construction."""
    return {
        "fetched_at": "2026-08-21T00:00:00+00:00",
        "window": {"since_ts": since_ts, "until_ts": until_ts},
        "repos": [
            {
                "repo": name,
                "status": "ok",
                "change_days": days,
                "window_agreement": {"comparable": True, "agrees": True},
            }
            for name, days in repos.items()
        ],
    }


class TestAnchor(unittest.TestCase):
    def test_quantile_one_reproduces_max_exactly(self):
        """The two anchors are one dial, not two rules; if this drifts apart the
        quantile results stop being comparable to the original finding."""
        for gaps in ([1, 2, 3], [5], [1, 1, 1, 900], list(range(1, 40))):
            with self.subTest(gaps=gaps):
                self.assertEqual(
                    ds.anchor_gap(gaps, ds.Config(anchor="quantile", quantile=1.0)),
                    ds.anchor_gap(gaps, ds.Config(anchor="max")),
                )

    def test_quantile_outside_zero_to_one_clamps_instead_of_raising(self):
        gaps = [1, 2, 3, 4, 5]
        self.assertEqual(ds.anchor_gap(gaps, ds.Config(anchor="quantile", quantile=1.4)), 5)
        self.assertEqual(ds.anchor_gap(gaps, ds.Config(anchor="quantile", quantile=-0.2)), 1)

    def test_quantile_is_nearest_rank(self):
        gaps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        cfg = ds.Config(anchor="quantile", quantile=0.9)
        self.assertEqual(ds.anchor_gap(gaps, cfg), 9)

    def test_quantile_ignores_a_single_historic_dormancy(self):
        """`datasets/covid-19` in miniature: daily for years, then one huge gap."""
        gaps = [1] * 99 + [900]
        self.assertEqual(ds.anchor_gap(gaps, ds.Config(anchor="max")), 900)
        self.assertEqual(
            ds.anchor_gap(gaps, ds.Config(anchor="quantile", quantile=0.99)), 1
        )

    def test_max_anchor_is_monotone_in_history_but_quantile_is_not(self):
        """The mechanism behind the whole amendment, as an assertion.

        A max-anchored threshold can only rise as history grows, so more history
        strictly weakens the detector. A quantile-anchored one can fall back
        toward what the source normally does.
        """
        short = [1, 1, 1, 1, 1]
        long = [900] + short * 40
        mx, qt = ds.Config(anchor="max"), ds.Config(anchor="quantile", quantile=0.99)
        self.assertGreater(ds.anchor_gap(long, mx), ds.anchor_gap(short, mx))
        self.assertEqual(ds.anchor_gap(long, qt), ds.anchor_gap(short, qt))


class TestPriorHistory(unittest.TestCase):
    def setUp(self):
        start, end = date(2026, 3, 1), date(2026, 6, 1)
        # In-window: two changes then silence. Alone that is uncalibratable.
        self.p = payload({"slow/dead": ["2026-03-01", "2026-03-04"]},
                         start.isoformat(), end.isoformat())
        self.since_ts, self.until_ts = ts(start.isoformat()), ts(end.isoformat())

    def test_prior_days_make_a_thin_source_calibratable(self):
        without = ds.evaluate_all(self.p, ds.Config(fallback="none"))
        self.assertEqual(without["totals"]["never_calibrated"], ["slow/dead"])

        history = [f"2026-01-{d:02d}" for d in range(1, 20)]
        with_prior = ds.evaluate_all(
            self.p, ds.Config(fallback="none"), prior({"slow/dead": history}, self.since_ts, self.until_ts)
        )
        self.assertEqual(with_prior["totals"]["never_calibrated"], [])

    def test_prior_days_after_the_window_start_are_ignored(self):
        """Only pre-window days are prior history; anything else would double-count
        the in-window record the detector already has."""
        history = ["2026-01-05", "2026-04-01", "2026-05-01"]
        got = ds.prior_days_by_repo(
            prior({"slow/dead": history}, self.since_ts, self.until_ts), date(2026, 3, 1)
        )
        self.assertEqual(got["slow/dead"], [date(2026, 1, 5)])

    def test_a_source_whose_window_days_disagree_is_dropped_not_half_trusted(self):
        payload_prior = prior({"slow/dead": ["2026-01-05"]}, self.since_ts, self.until_ts)
        payload_prior["repos"][0]["window_agreement"] = {"comparable": True, "agrees": False}
        self.assertEqual(ds.prior_days_by_repo(payload_prior, date(2026, 3, 1)), {})

    def test_ground_truth_does_not_move_when_calibration_changes(self):
        """Prior history may change what the detector believes, never what it is
        graded against — otherwise the calibration sets its own exam."""
        history = [f"2026-01-{d:02d}" for d in range(1, 20)]
        a = ds.evaluate_all(self.p, ds.Config())
        b = ds.evaluate_all(
            self.p, ds.Config(), prior({"slow/dead": history}, self.since_ts, self.until_ts)
        )
        for key in ("quiet_at_window_end", "last_change", "trailing_silence_days", "change_days"):
            with self.subTest(key=key):
                self.assertEqual(a["sources"]["slow/dead"][key], b["sources"]["slow/dead"][key])

    def test_prior_history_removes_the_cold_start_category(self):
        """Cold-start alarms are an artifact of history starting at the window.
        With prior history there is no such thing, so they are counted as the
        real mid-window alarms they are rather than discounted."""
        start, end = date(2026, 3, 1), date(2026, 6, 1)
        late = payload({"late/start": ["2026-05-20", "2026-05-21"]},
                       start.isoformat(), end.isoformat())
        without = ds.evaluate_all(late, ds.Config(fallback="fixed"))
        self.assertGreater(without["totals"]["cold_start_alarm_days_total"], 0)

        history = [f"2026-01-{d:02d}" for d in range(1, 20)]
        with_prior = ds.evaluate_all(
            late, ds.Config(fallback="fixed"),
            prior({"late/start": history}, ts(start.isoformat()), ts(end.isoformat())),
        )
        self.assertEqual(with_prior["totals"]["cold_start_alarm_days_total"], 0)


class TestFullHistoryFindingsAgainstRealData(unittest.TestCase):
    """Pins the 2026-08-21 amendment against the fetched full history."""

    @classmethod
    def setUpClass(cls):
        if not ds.DEFAULT_RESULTS.exists():  # pragma: no cover - depends on checkout
            raise unittest.SkipTest(f"missing {ds.DEFAULT_RESULTS}")
        prior_path = Path(__file__).with_name("prior-history-2026-08-21.json")
        if not prior_path.exists():  # pragma: no cover - depends on checkout
            raise unittest.SkipTest(f"missing {prior_path}")
        cls.payload = json.loads(ds.DEFAULT_RESULTS.read_text())
        cls.prior = json.loads(prior_path.read_text())

    def test_every_source_agreed_with_the_saved_records_in_window(self):
        """The seam check. If a fetch ever disagrees, the pre-window days are
        measuring something else and every number below is void."""
        for entry in self.prior["repos"]:
            with self.subTest(repo=entry["repo"]):
                self.assertEqual(entry["status"], "ok")
                self.assertTrue(entry["window_agreement"]["agrees"])

    def test_full_history_calibrates_every_source_including_both_quiet_ones(self):
        """Refutes the window-only finding's generalisation: being uncalibratable
        was a property of the 180-day clone, not of these sources."""
        r = ds.evaluate_all(self.payload, ds.Config(), self.prior)
        self.assertEqual(r["totals"]["never_calibrated"], [])
        for repo in ("FDA/openfda", "datasets/covid-19"):
            with self.subTest(repo=repo):
                self.assertEqual(r["sources"][repo]["calibrated_day_share"], 1.0)

    def test_more_history_makes_the_max_anchored_rule_catch_strictly_less(self):
        """The inversion. The probe's shipped operating point caught 2 of 2 only
        because its history was too short to know better; on full history the
        same configuration catches nothing."""
        cfg = ds.Config(fallback="pooled", multiplier=2.0, min_gaps=2)
        window_only = ds.evaluate_all(self.payload, cfg)
        full = ds.evaluate_all(self.payload, cfg, self.prior)
        self.assertEqual(window_only["totals"]["detected_terminal_silence"], 2)
        self.assertEqual(full["totals"]["detected_terminal_silence"], 0)

    def test_max_anchor_on_full_history_catches_nothing_at_any_setting(self):
        for multiplier in (1.0, 1.5, 2.0, 3.0):
            for fallback in ("none", "fixed", "pooled"):
                cfg = ds.Config(multiplier=multiplier, min_gaps=2, fallback=fallback)
                r = ds.evaluate_all(self.payload, cfg, self.prior)
                with self.subTest(multiplier=multiplier, fallback=fallback):
                    self.assertEqual(r["totals"]["detected_terminal_silence"], 0)

    def test_p99_quantile_on_full_history_is_the_operating_point(self):
        """1 of 2 caught at 8 days, with one nuisance alarm-day in 180 across
        nine sources — against the shipped point's 10, plus 74 cold-start days."""
        cfg = ds.Config(anchor="quantile", quantile=0.99, fallback="none")
        r = ds.evaluate_all(self.payload, cfg, self.prior)
        self.assertEqual(r["totals"]["detected_terminal_silence"], 1)
        self.assertEqual(r["totals"]["missed_quiet_sources"], ["FDA/openfda"])
        self.assertEqual(r["sources"]["datasets/covid-19"]["detection_latency_days"], 8)
        self.assertEqual(r["totals"]["mid_window_alarm_days_total"], 1)

    def test_the_paying_registers_stay_silent_under_the_new_operating_point(self):
        cfg = ds.Config(anchor="quantile", quantile=0.99, fallback="none")
        r = ds.evaluate_all(self.payload, cfg, self.prior)
        for repo in ("github/advisory-database", "ossf/malicious-packages", "cisagov/kev-data"):
            with self.subTest(repo=repo):
                self.assertEqual(r["sources"][repo]["mid_window_alarm_days"], 0)

    def test_catching_the_missed_source_costs_two_orders_of_magnitude_in_noise(self):
        """Why the miss is accepted rather than tuned away."""
        p99 = ds.evaluate_all(
            self.payload, ds.Config(anchor="quantile", quantile=0.99), self.prior
        )
        p50 = ds.evaluate_all(
            self.payload, ds.Config(anchor="quantile", quantile=0.50), self.prior
        )
        self.assertEqual(p50["totals"]["detected_terminal_silence"], 2)
        self.assertGreater(
            p50["totals"]["mid_window_alarm_days_total"],
            100 * p99["totals"]["mid_window_alarm_days_total"],
        )

    def test_the_missed_source_is_undetectable_rather_than_mistuned(self):
        """`FDA/openfda`'s own history contains 14 gaps at least as long as the
        73-day silence it is being asked to flag, out of 37. Any threshold that
        calls that silence anomalous calls 38% of the source's normal behaviour
        anomalous too — a fact about the source, not about the estimator."""
        entry = next(e for e in self.prior["repos"] if e["repo"] == "FDA/openfda")
        days = [date.fromisoformat(d) for d in entry["change_days"]]
        gaps = ds.gaps_between(days)
        trailing = 73
        over = [g for g in gaps if g >= trailing]
        self.assertEqual(len(gaps), 37)
        self.assertEqual(len(over), 14)
        self.assertGreater(len(over) / len(gaps), 0.35)


if __name__ == "__main__":
    unittest.main()
