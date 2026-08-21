"""Tests for the subscriber-facing record.

The load-bearing ones are not about formatting. This product's errors are
structurally invisible to the person paying for it — a missed dormancy and a
healthy register look identical from outside — so the tests that matter check
that the record never renders an absence of alerts as reassurance, and that the
measured detection rate reaches the reader rather than stopping in a research
file.

    python3 -m unittest test_subscriber_record
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import detect_silence
import subscriber_record as sr

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]


def _result():
    payload = json.loads(
        (REPO / "portfolio/research/register-change-rate/results-2026-08-20.json").read_text()
    )
    prior_path = HERE / "prior-history-2026-08-21.json"
    prior = json.loads(prior_path.read_text()) if prior_path.exists() else None
    cfg = detect_silence.Config(anchor="quantile", quantile=0.99)
    return detect_silence.evaluate_all(payload, cfg, prior)


class Record(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = _result()
        cls.record = sr.build_record(cls.result, "2026-08-21T00:00:00Z")
        cls.md = sr.to_markdown(cls.record)

    def test_record_is_json_serialisable_and_stamped(self):
        json.loads(sr.to_json(self.record))
        self.assertEqual(self.record["generated_at"], "2026-08-21T00:00:00Z")
        self.assertEqual(self.record["tool"]["name"], "source-silence-detector")

    def test_no_clock_is_read(self):
        """Two builds from the same inputs must be byte-identical."""
        again = sr.build_record(_result(), "2026-08-21T00:00:00Z")
        self.assertEqual(sr.to_json(self.record), sr.to_json(again))

    def test_covers_every_source_the_detector_evaluated(self):
        self.assertEqual(
            sorted(s["source"] for s in self.record["sources"]),
            sorted(self.result["sources"]),
        )


class TheErrorIsInvisibleSoTheRecordMustSaySo(unittest.TestCase):
    """The gate question for `public-record-watch`, as tests."""

    @classmethod
    def setUpClass(cls):
        cls.record = sr.build_record(_result(), "2026-08-21T00:00:00Z")
        cls.md = sr.to_markdown(cls.record)

    def test_absence_of_an_alert_is_never_rendered_as_health(self):
        """"active", "healthy", "OK", "clear" are all claims this watch cannot make."""
        states = {s["state"] for s in self.record["sources"]}
        for state in states:
            low = state.lower()
            for forbidden in ("active", "healthy", "ok", "clear", "fine", "up to date"):
                self.assertNotIn(
                    forbidden,
                    low,
                    f"state {state!r} implies a claim the detector cannot support",
                )

    def test_the_silence_caveat_is_in_the_record_and_high_up(self):
        self.assertIn(sr.SILENCE_CAVEAT, self.md)
        self.assertIn("NOT EVIDENCE THAT A REGISTER IS ACTIVE", self.md)
        # Above the source table it qualifies.
        self.assertLess(self.md.index(sr.SILENCE_CAVEAT), self.md.index("## Sources"))

    def test_the_detection_rate_reaches_the_reader(self):
        """0.35 is committed in this probe's README; it must not stop there."""
        self.assertIn("0.35", self.md)
        self.assertIn("6 of 17", self.md)

    def test_the_direction_of_error_is_named(self):
        self.assertIn("under-reporting", self.md)

    def test_the_commercial_incentive_is_disclosed(self):
        """A miss costs us nothing and is invisible — deduction 3's question."""
        statement = self.record["accuracy_statement"]
        self.assertIn("a miss costs us nothing and is invisible to you", statement)
        self.assertIn(statement, self.md)

    def test_a_source_that_cannot_usefully_alarm_is_named_not_inferred(self):
        """FDA/openfda calibrates to a 5.6-year threshold and reads 'no alert'."""
        flagged = self.record["summary"]["effectively_unwatched"]
        self.assertIn("FDA/openfda", flagged)
        row = next(s for s in self.record["sources"] if s["source"] == "FDA/openfda")
        self.assertIsNotNone(row["practical_note"])
        self.assertIn("effectively unwatched", row["practical_note"])
        self.assertIn("Sources this watch does not usefully cover", self.md)

    def test_uncalibrated_sources_are_disclosed_as_uncovered(self):
        """Synthetic: no source in the live corpus is uncalibrated."""
        result = _result()
        name = sorted(result["sources"])[0]
        result["sources"][name]["final_threshold"] = None
        result["totals"]["never_calibrated"] = [name]
        record = sr.build_record(result, "2026-08-21T00:00:00Z")
        row = next(s for s in record["sources"] if s["source"] == name)
        self.assertFalse(row["watched"])
        self.assertIn("NOT WATCHED", row["state"])
        self.assertIn("No alarm can fire", row["practical_note"])
        self.assertIn("NOT watched", sr.to_markdown(record))


class AccuracyFigures(unittest.TestCase):
    def test_both_figures_are_present_and_complete(self):
        self.assertEqual(
            {f.metric for f in sr.ACCURACY}, {"detection rate", "detection latency"}
        )
        for figure in sr.ACCURACY:
            for field in ("value", "direction", "reads", "corpus", "measured", "caveat"):
                self.assertTrue(getattr(figure, field).strip(), f"{figure.metric}/{field}")

    def test_figures_cite_a_derivation_that_exists(self):
        for figure in sr.ACCURACY:
            self.assertTrue(
                (HERE / figure.source).exists(),
                f"{figure.metric}: derivation missing at {figure.source}",
            )

    def test_the_detection_rate_matches_the_committed_holdout(self):
        """Pinned to the results file, so a re-run that moves it fails here.

        The same discipline `eaa-wcag-triage`'s test_accuracy_citations.py
        applies: a rate revised upstream must not go on being quoted at a
        subscriber.
        """
        readme = (HERE / "README.md").read_text()
        self.assertIn("episodes (0.35) at a median latency of 110 days", readme)
        figure = next(f for f in sr.ACCURACY if f.metric == "detection rate")
        self.assertIn("0.35", figure.value)
        latency = next(f for f in sr.ACCURACY if f.metric == "detection latency")
        self.assertIn("110", latency.value)

    def test_missing_accuracy_renders_as_absence_not_silence(self):
        record = sr.build_record(_result(), "2026-08-21T00:00:00Z")
        record["accuracy"] = []
        md = sr.to_markdown(record)
        self.assertIn("## How accurate this watch is", md)
        self.assertIn("No accuracy measurement is recorded", md)
        self.assertIn("**Accuracy:** not measured", md)


if __name__ == "__main__":
    unittest.main()
