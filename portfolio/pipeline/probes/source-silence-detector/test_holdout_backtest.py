#!/usr/bin/env python3
"""Offline tests for `holdout_backtest.py`.

The load-bearing one is `TestAgreesWithDayLoop`: `holdout_backtest.replay_source`
replaces `detect_silence.evaluate_source`'s day-by-day loop with a closed form,
and a closed form that disagrees with the loop it replaces would make every
number in the held-out report a fiction that still looked plausible. These tests
assert the agreement on generated histories rather than on one hand-picked case.

No network, no fixtures beyond the committed history file.
"""

from __future__ import annotations

import json
import math
import random
import unittest
from datetime import date, timedelta
from pathlib import Path

import detect_silence
import holdout_backtest as hb
from detect_silence import Config

HERE = Path(__file__).resolve().parent


def days_from(start: date, offsets: list[int]) -> list[date]:
    return [start + timedelta(days=o) for o in offsets]


def alarm_days_from_replay(records: list[dict]) -> set[date]:
    """Expand the closed-form alarm intervals back into individual days."""
    out: set[date] = set()
    for r in records:
        if not r["alarm_days"]:
            continue
        first = date.fromisoformat(r["first_alarm"])
        out.update(first + timedelta(days=i) for i in range(r["alarm_days"]))
    return out


class TestAgreesWithDayLoop(unittest.TestCase):
    """The closed form must reproduce `detect_silence`'s day loop exactly."""

    def _compare(self, offsets: list[int], cfg: Config, span: int) -> None:
        start = date(2020, 1, 1)
        days = days_from(start, offsets)
        end = start + timedelta(days=span)

        loop = detect_silence.evaluate_source(days, start, end, cfg)
        loop_days = {date.fromisoformat(a["day"]) for a in loop["alarms"]}
        closed = alarm_days_from_replay(hb.replay_source(days, end, cfg))

        self.assertEqual(
            loop_days,
            closed,
            f"offsets={offsets} anchor={cfg.anchor}/{cfg.quantile}\n"
            f"  only in day loop: {sorted(loop_days - closed)}\n"
            f"  only in closed form: {sorted(closed - loop_days)}",
        )

    def test_matches_on_a_hand_written_history(self) -> None:
        # Daily for a fortnight, then a long silence.
        self._compare(list(range(14)) + [200], Config(min_gaps=5, warmup_days=0), 260)

    def test_matches_with_warmup_suppressing_early_alarms(self) -> None:
        self._compare([0, 1, 2, 3, 4, 5, 90], Config(min_gaps=5, warmup_days=60), 150)

    def test_matches_when_never_calibrated(self) -> None:
        # Fewer gaps than `min_gaps`: the detector must stay silent in both.
        records = hb.replay_source(days_from(date(2020, 1, 1), [0, 5]), date(2021, 1, 1), Config())
        self.assertTrue(all(r["alarm_days"] == 0 for r in records))
        self._compare([0, 5], Config(), 365)

    def test_matches_on_random_histories_under_every_anchor(self) -> None:
        rng = random.Random(20260821)  # fixed seed: the suite must be reproducible
        for trial in range(40):
            n = rng.randint(6, 40)
            offsets, cursor = [0], 0
            for _ in range(n):
                # Mostly short gaps with occasional dormancy, like the real mirrors.
                cursor += rng.choice([1, 1, 1, 2, 3, 7, 30, 120, 400])
                offsets.append(cursor)
            span = cursor + rng.randint(0, 500)
            for anchor, quantile in hb.ANCHOR_GRID:
                cfg = hb.config_for(anchor, quantile, Config())
                with self.subTest(trial=trial, anchor=hb.anchor_label(anchor, quantile)):
                    self._compare(offsets, cfg, span)


class TestReplayShape(unittest.TestCase):
    def test_one_record_per_change_day_including_the_open_trailing_gap(self) -> None:
        days = days_from(date(2020, 1, 1), [0, 10, 20])
        records = hb.replay_source(days, date(2020, 3, 1), Config())
        self.assertEqual(len(records), 3)
        self.assertTrue(records[-1]["open"])
        self.assertEqual(records[-1]["gap_days"], (date(2020, 3, 1) - date(2020, 1, 21)).days)
        self.assertFalse(any(r["open"] for r in records[:-1]))

    def test_gap_days_are_the_intervals_between_changes(self) -> None:
        records = hb.replay_source(
            days_from(date(2020, 1, 1), [0, 3, 11]), date(2020, 1, 15), Config()
        )
        # Two closed gaps, then the open trailing gap out to the observation end.
        self.assertEqual([r["gap_days"] for r in records], [3, 8, 3])

    def test_a_trailing_gap_of_zero_days_when_the_source_changed_on_the_last_day(self) -> None:
        records = hb.replay_source(
            days_from(date(2020, 1, 1), [0, 3, 11]), date(2020, 1, 12), Config()
        )
        self.assertEqual(records[-1]["gap_days"], 0)
        self.assertEqual(records[-1]["alarm_days"], 0)

    def test_threshold_is_fitted_only_on_gaps_that_had_already_closed(self) -> None:
        # No lookahead: the record for a gap carries the threshold derived from
        # history strictly before that gap opened.
        cfg = Config(min_gaps=2, warmup_days=0, floor_days=1, multiplier=1.0)
        records = hb.replay_source(days_from(date(2020, 1, 1), [0, 2, 4, 100]), date(2020, 6, 1), cfg)
        self.assertIsNone(records[0]["threshold"])
        self.assertIsNone(records[1]["threshold"])
        self.assertEqual(records[2]["threshold"], 2)  # gaps [2, 2] seen so far
        self.assertEqual(records[3]["threshold"], 96)  # now includes the 96-day gap

    def test_latency_is_measured_from_the_last_change(self) -> None:
        cfg = Config(min_gaps=2, warmup_days=0, floor_days=1, multiplier=1.0)
        records = hb.replay_source(days_from(date(2020, 1, 1), [0, 2, 4, 100]), date(2020, 6, 1), cfg)
        gap = records[2]
        self.assertEqual(gap["latency_days"], gap["threshold"] + 1)
        self.assertEqual(gap["first_alarm"], (date(2020, 1, 5) + timedelta(days=3)).isoformat())

    def test_prior_history_days_counts_from_the_first_change(self) -> None:
        records = hb.replay_source(days_from(date(2020, 1, 1), [0, 10, 40]), date(2020, 3, 1), Config())
        self.assertEqual([r["prior_history_days"] for r in records], [0, 10, 40])

    def test_empty_history_yields_no_records(self) -> None:
        self.assertEqual(hb.replay_source([], date(2020, 1, 1), Config()), [])


class TestScoring(unittest.TestCase):
    def _records(self, **over) -> list[dict]:
        base = {
            "last_change": "2020-01-01",
            "gap_days": 10,
            "open": False,
            "threshold": 5,
            "calibrated": True,
            "prior_history_days": 0,
            "prior_gaps": 5,
            "alarm_days": 0,
            "first_alarm": None,
            "latency_days": None,
            "evaluable": True,
        }
        base.update(over)
        return [base]

    def test_long_gaps_are_episodes_and_short_ones_are_nuisance(self) -> None:
        records = (
            self._records(gap_days=200, alarm_days=3, latency_days=50, last_change="2020-01-01")
            + self._records(gap_days=10, alarm_days=4, last_change="2020-08-01")
        )
        score = hb.score_source(records, dormancy_days=120)
        self.assertEqual(score["episodes"], 1)
        self.assertEqual(score["episodes_detected"], 1)
        self.assertEqual(score["nuisance_alarm_days"], 4)
        self.assertEqual(score["nuisance_alarm_episodes"], 1)

    def test_an_uncalibrated_episode_is_excluded_not_counted_as_a_miss(self) -> None:
        score = hb.score_source(
            self._records(gap_days=200, evaluable=False, threshold=None, calibrated=False), 120
        )
        self.assertEqual(score["episodes"], 1)
        self.assertEqual(score["episodes_evaluable"], 0)
        self.assertEqual(score["episodes_skipped_uncalibrated"], 1)
        self.assertIsNone(score["recall"])

    def test_a_missed_episode_is_listed_with_the_threshold_that_missed_it(self) -> None:
        score = hb.score_source(self._records(gap_days=200, threshold=900), 120)
        self.assertEqual(score["episodes_detected"], 0)
        self.assertEqual(score["recall"], 0.0)
        self.assertEqual(score["misses"], [{"last_change": "2020-01-01", "gap_days": 200, "threshold": 900}])


class TestAggregate(unittest.TestCase):
    def test_recall_pools_episodes_rather_than_averaging_per_source_rates(self) -> None:
        # A source with one episode detected and one with nine of which three
        # were: pooled recall is 4/10, not the mean of 1.0 and 0.333.
        per_source = {
            "small": {
                "episodes_evaluable": 1, "episodes_detected": 1, "episodes_skipped_uncalibrated": 0,
                "median_latency_days": 5, "nuisance_alarm_days": 0, "nuisance_alarm_episodes": 0,
                "observed_days": 365,
            },
            "big": {
                "episodes_evaluable": 9, "episodes_detected": 3, "episodes_skipped_uncalibrated": 0,
                "median_latency_days": 50, "nuisance_alarm_days": 10, "nuisance_alarm_episodes": 2,
                "observed_days": 365,
            },
        }
        agg = hb.aggregate(per_source)
        self.assertEqual(agg["episodes_detected"], 4)
        self.assertEqual(agg["episodes_evaluable"], 10)
        self.assertEqual(agg["recall"], 0.4)

    def test_nuisance_rate_is_per_source_year(self) -> None:
        agg = hb.aggregate(
            {
                "a": {
                    "episodes_evaluable": 0, "episodes_detected": 0,
                    "episodes_skipped_uncalibrated": 0, "median_latency_days": None,
                    "nuisance_alarm_days": 10, "nuisance_alarm_episodes": 1,
                    "observed_days": 365,
                }
            }
        )
        self.assertAlmostEqual(agg["nuisance_days_per_source_year"], 10.01, places=2)

    def test_no_sources_does_not_divide_by_zero(self) -> None:
        agg = hb.aggregate({})
        self.assertIsNone(agg["recall"])
        self.assertIsNone(agg["nuisance_days_per_source_year"])


class TestSelectionObjective(unittest.TestCase):
    def _row(self, anchor: str, detected: int, rate: float, latency: float | None = 10.0) -> dict:
        return {
            "anchor": anchor,
            "episodes_detected": detected,
            "nuisance_days_per_source_year": rate,
            "median_latency_days": latency,
        }

    def test_an_anchor_within_budget_beats_a_louder_one_that_detects_more(self) -> None:
        loud = self._row("quantile:0.5", 17, 70.0)
        quiet = self._row("quantile:0.99", 8, 4.0)
        self.assertEqual(min([loud, quiet], key=lambda r: hb._selection_key(r, 5.0)), quiet)

    def test_within_budget_more_detections_wins(self) -> None:
        fewer = self._row("max", 6, 1.9)
        more = self._row("quantile:0.99", 8, 4.1)
        self.assertEqual(min([fewer, more], key=lambda r: hb._selection_key(r, 5.0)), more)

    def test_when_nothing_fits_the_quietest_wins(self) -> None:
        a = self._row("quantile:0.9", 14, 20.0)
        b = self._row("quantile:0.75", 17, 43.0)
        self.assertEqual(min([a, b], key=lambda r: hb._selection_key(r, 5.0)), a)

    def test_latency_breaks_ties_between_equally_good_anchors(self) -> None:
        slow = self._row("max", 6, 1.9, latency=200.0)
        fast = self._row("quantile:0.99", 6, 1.9, latency=20.0)
        self.assertEqual(min([slow, fast], key=lambda r: hb._selection_key(r, 5.0)), fast)


class TestLeaveOneSourceOut(unittest.TestCase):
    def setUp(self) -> None:
        start = date(2020, 1, 1)
        self.history = {
            "steady": days_from(start, [i * 2 for i in range(200)]),
            "dormant": days_from(start, list(range(0, 60)) + [400, 402, 404, 900]),
            "chatty": days_from(start, list(range(0, 900, 3))),
        }
        self.end = date(2024, 1, 1)

    def test_every_source_is_held_out_exactly_once(self) -> None:
        loso = hb.leave_one_source_out(self.history, self.end, Config(), 120)
        self.assertEqual([f["held_out"] for f in loso["folds"]], sorted(self.history))

    def test_a_folds_training_set_is_exactly_everything_but_the_held_out_source(self) -> None:
        # Whether an episode is evaluable depends only on `min_gaps` and warm-up,
        # never on the anchor, so the training and test episode counts must add
        # up to the whole sample exactly. An off-by-one here would mean a source
        # was leaking into the choice made for it.
        scored = hb.score_all_anchors(self.history, self.end, Config(), 120)
        any_anchor = next(iter(scored.values()))
        total = sum(s["episodes_evaluable"] for s in any_anchor.values())

        loso = hb.leave_one_source_out(self.history, self.end, Config(), 120, scored=scored)
        for fold in loso["folds"]:
            held = any_anchor[fold["held_out"]]["episodes_evaluable"]
            self.assertEqual(
                fold["train_episodes_evaluable"] + held, total, f"leak in fold {fold['held_out']}"
            )
            self.assertEqual(fold["test"]["episodes_evaluable"], held)

    def test_evaluability_does_not_depend_on_the_anchor(self) -> None:
        scored = hb.score_all_anchors(self.history, self.end, Config(), 120)
        counts = {
            label: tuple(sorted((r, s["episodes_evaluable"]) for r, s in by_source.items()))
            for label, by_source in scored.items()
        }
        self.assertEqual(len(set(counts.values())), 1, counts)

    def test_the_selected_anchor_is_one_of_the_grid(self) -> None:
        loso = hb.leave_one_source_out(self.history, self.end, Config(), 120)
        grid = {hb.anchor_label(a, q) for a, q in hb.ANCHOR_GRID}
        self.assertTrue(all(f["selected_anchor"] in grid for f in loso["folds"]))

    def test_unanimity_flag_matches_the_selected_set(self) -> None:
        loso = hb.leave_one_source_out(self.history, self.end, Config(), 120)
        self.assertEqual(loso["unanimous"], len(loso["anchors_selected"]) == 1)

    def test_budget_is_recorded_in_the_objective_string(self) -> None:
        loso = hb.leave_one_source_out(self.history, self.end, Config(), 120, budget=7.5)
        self.assertIn("7.5", loso["objective"])
        self.assertEqual(loso["budget_days_per_source_year"], 7.5)


class TestLoadHistory(unittest.TestCase):
    def _write(self, tmp: Path, repos: list[dict]) -> Path:
        path = tmp / "history.json"
        path.write_text(json.dumps({"fetched_at": "2026-08-21T00:00:00+00:00", "repos": repos}))
        return path

    def test_drops_failed_fetches_and_disagreeing_sources(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            path = self._write(
                Path(td),
                [
                    {"repo": "ok", "status": "ok", "change_days": ["2020-01-01", "2020-01-05"],
                     "window_agreement": {"comparable": True, "agrees": True}},
                    {"repo": "failed", "status": "error", "change_days": ["2020-01-01"]},
                    {"repo": "disagrees", "status": "ok", "change_days": ["2020-01-01"],
                     "window_agreement": {"comparable": True, "agrees": False}},
                    {"repo": "empty", "status": "ok", "change_days": [],
                     "window_agreement": {"comparable": False}},
                ],
            )
            history, payload = hb.load_history(path)
            self.assertEqual(sorted(history), ["ok"])
            self.assertEqual(sorted(payload["_dropped"]), ["disagrees", "empty", "failed"])

    def test_change_days_are_deduplicated_and_sorted(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            path = self._write(
                Path(td),
                [{"repo": "r", "status": "ok",
                  "change_days": ["2020-01-05", "2020-01-01", "2020-01-05"],
                  "window_agreement": {"comparable": True, "agrees": True}}],
            )
            history, _ = hb.load_history(path)
            self.assertEqual(history["r"], [date(2020, 1, 1), date(2020, 1, 5)])

    def test_observation_end_comes_from_the_data_not_the_clock(self) -> None:
        history = {"a": [date(2020, 1, 1), date(2021, 6, 1)], "b": [date(2020, 1, 1)]}
        self.assertEqual(hb.observation_end(history, {}), date(2021, 6, 1))


class TestAgainstTheCommittedHistory(unittest.TestCase):
    """The report the README quotes must be reproducible from the committed file."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.history, cls.payload = hb.load_history(hb.DEFAULT_PRIOR)
        cls.end = hb.observation_end(cls.history, cls.payload)

    def test_all_nine_mirrors_survive_the_agreement_filter(self) -> None:
        self.assertEqual(len(self.history), 9)
        self.assertEqual(self.payload["_dropped"], [])

    def test_quantile_one_reproduces_max_exactly(self) -> None:
        # The control row in the sweep. If these ever differ the sweep is wrong,
        # not the finding.
        a = hb.score_source(
            hb.replay_source(self.history["FDA/openfda"], self.end,
                             hb.config_for("max", None, Config())), 120)
        b = hb.score_source(
            hb.replay_source(self.history["FDA/openfda"], self.end,
                             hb.config_for("quantile", 1.0, Config())), 120)
        self.assertEqual(a["episodes_detected"], b["episodes_detected"])
        self.assertEqual(a["nuisance_alarm_days"], b["nuisance_alarm_days"])

    def test_recall_is_monotone_non_increasing_in_the_quantile(self) -> None:
        # A higher quantile is a looser threshold, so it cannot detect more.
        # This is the mechanism the whole anchor argument rests on; if it fails
        # on the real data, the argument is wrong somewhere.
        quantiles = [0.5, 0.75, 0.9, 0.95, 0.99, 1.0]
        detected = []
        for q in quantiles:
            cfg = hb.config_for("quantile", q, Config())
            per_source = {
                repo: hb.score_source(hb.replay_source(days, self.end, cfg), 120)
                for repo, days in self.history.items()
            }
            detected.append(hb.aggregate(per_source)["episodes_detected"])
        self.assertEqual(detected, sorted(detected, reverse=True), detected)

    def test_p99_is_exactly_max_on_the_sparsest_source(self) -> None:
        # The finding the amendment turns on. `FDA/openfda` has 37 closed gaps,
        # so nearest rank ceil(0.99 * 37) = 37 picks the largest one: on that
        # source the recommended anchor and the anchor it replaced are the same
        # number, and therefore the same detector.
        deg = hb.quantile_degeneracy(self.history, self.end, Config(), 120, 0.99)
        self.assertEqual(deg["degenerate_sources"], ["FDA/openfda"])
        row = deg["per_source"]["FDA/openfda"]
        self.assertEqual(row["anchor_gap_days"], row["max_gap_days"])
        self.assertEqual(row["final_threshold_quantile"], row["final_threshold_max"])
        self.assertEqual(row["detected_quantile"], row["detected_max"])

    def test_the_degeneracy_bound_partitions_the_sources(self) -> None:
        for q in (0.99, 0.95, 0.9, 0.75, 0.5):
            deg = hb.quantile_degeneracy(self.history, self.end, Config(), 120, q)
            needed = deg["gaps_needed_for_a_non_degenerate_anchor"]
            for repo, row in deg["per_source"].items():
                with self.subTest(q=q, repo=repo):
                    self.assertEqual(row["degenerate"], row["closed_gaps"] < needed)

    def test_the_bound_is_measured_from_ceil_not_from_the_float_formula(self) -> None:
        # In exact arithmetic the bound is `1 / (1 - q)`, and the measured bound
        # agrees with it — including the headline 100 gaps at q=0.99. What does
        # not agree is that formula evaluated in floating point: `1 / (1 - 0.9)`
        # is `10.000000000000002`, so `math.ceil` of it says 11 when the detector
        # actually escapes `max` at 10.
        self.assertEqual(hb._degeneracy_bound(0.99), 100)
        self.assertEqual(hb._degeneracy_bound(0.95), 20)
        self.assertEqual(hb._degeneracy_bound(0.9), 10)
        self.assertEqual(hb._degeneracy_bound(0.5), 2)
        self.assertEqual(math.ceil(1 / (1 - 0.9)), 11)  # the formula, not the detector

    def test_below_the_bound_the_quantile_anchor_is_the_maximum(self) -> None:
        from detect_silence import anchor_gap

        for q in (0.99, 0.95, 0.9):
            bound = hb._degeneracy_bound(q)
            cfg = hb.config_for("quantile", q, Config())
            for n in range(1, bound):
                gaps = list(range(1, n + 1))
                with self.subTest(q=q, n=n):
                    self.assertEqual(anchor_gap(gaps, cfg), max(gaps))
            gaps = list(range(1, bound + 1))
            self.assertLess(anchor_gap(gaps, cfg), max(gaps))

    def test_a_degenerate_source_carries_most_of_the_episode_sample(self) -> None:
        # Stated as a test because it is the reason the degeneracy matters at
        # all: if it only hit sources with no episodes it would be a curiosity.
        deg = hb.quantile_degeneracy(self.history, self.end, Config(), 120, 0.99)
        self.assertGreater(deg["episodes_on_degenerate_sources"], deg["episodes_total"] / 3)

    def test_report_builds_and_carries_every_section(self) -> None:
        report = hb.build_report(hb.DEFAULT_PRIOR, Config(), 120, 5.0)
        for key in ("in_sample", "leave_one_source_out", "budget_sweep",
                    "dormancy_sweep", "anchor_decay", "quantile_degeneracy"):
            self.assertIn(key, report)
        self.assertEqual(len(report["budget_sweep"]), len(hb.BUDGET_GRID))
        self.assertEqual(len(report["dormancy_sweep"]), len(hb.DORMANCY_GRID))
        self.assertTrue(hb.render(report))

    def test_the_run_is_deterministic(self) -> None:
        a = hb.build_report(hb.DEFAULT_PRIOR, Config(), 120, 5.0)
        b = hb.build_report(hb.DEFAULT_PRIOR, Config(), 120, 5.0)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))


class TestHouseRules(unittest.TestCase):
    def test_the_module_makes_no_network_calls(self) -> None:
        source = (HERE / "holdout_backtest.py").read_text()
        for forbidden in ("urllib", "requests", "socket", "subprocess", "http.client"):
            self.assertNotIn(
                f"import {forbidden}", source, f"{forbidden} would break the read-only house rule"
            )


if __name__ == "__main__":
    unittest.main()
