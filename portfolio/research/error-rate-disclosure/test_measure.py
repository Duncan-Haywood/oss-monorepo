"""Tests for the error-rate disclosure measurement.

Two kinds of test here, and the second kind is the point. The first checks the
mechanics — sentence splitting, the direction vocabulary, the deduction rubric.
The second pins the *classifications themselves*: if someone adds an accuracy
figure to one of these four artifacts, a test fails and this directory has to be
re-run rather than going on reporting a gap that has been closed.

    python3 -m unittest discover -s portfolio/research/error-rate-disclosure
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import measure

RESULTS = Path(__file__).resolve().parent / "results-2026-08-21.json"


class DirectionVocabulary(unittest.TestCase):
    def test_scope_language_is_not_an_accuracy_statement(self):
        """The conflation this whole measurement exists to separate."""
        scope_talk = (
            "This is a STATIC pass. It does not render the page, run its scripts, "
            "or use assistive technology, so it cannot confirm keyboard operability."
        )
        self.assertEqual(measure.direction_matches(scope_talk), [])

    def test_accuracy_statement_is_caught(self):
        hits = measure.direction_matches(
            "False positives are expected; a suppressed finding that should not "
            "have been is the failure this tool is built to avoid."
        )
        self.assertEqual(len(hits), 1)
        self.assertIn("False positives are expected", hits[0])

    def test_repeated_prose_counts_once(self):
        text = "Precision is 0.9. Precision is 0.9."
        self.assertEqual(len(measure.direction_matches(text)), 1)

    def test_every_term_is_about_being_wrong_not_about_scope(self):
        for term in measure.DIRECTION_TERMS:
            with self.subTest(term=term):
                self.assertEqual(
                    measure.direction_matches(f"Note: {term} applies here."),
                    [f"Note: {term} applies here."],
                )


class Citations(unittest.TestCase):
    def test_committed_citations_still_resolve(self):
        """A revised measurement elsewhere must break this, not be ignored."""
        for spec in measure.PROBE_SPECS:
            citation = spec.get("citation")
            if citation is None:
                self.assertIn("citation_absent_because", spec)
                continue
            with self.subTest(probe=spec["probe"]):
                citation.verify()

    def test_candidates_yaml_records_what_this_pass_scored(self):
        """The file this pass writes must agree with the score it derived.

        Not the other way round: the prior is pinned in ``PROBE_SPECS``, so a
        second run of ``measure.py`` cannot deduct the same points twice.
        """
        recorded = measure.recorded_scores()
        for spec in measure.PROBE_SPECS:
            with self.subTest(candidate=spec["candidate"]):
                row = measure.evaluate(spec)
                derived = measure.score(row, spec["prior"])["ethical_robustness_now"]
                self.assertEqual(recorded[spec["candidate"]], derived)


class Rubric(unittest.TestCase):
    def _row(self, **kw):
        row = {
            "candidate": "agent-permission-harness",
            "rate_in_artifact": True,
            "direction_disclosed": True,
        }
        row.update(kw)
        return row

    def test_full_disclosure_costs_nothing(self):
        out = measure.score(self._row(), 9)
        self.assertEqual(out["ethical_robustness_now"], 9)
        self.assertEqual(out["deductions_applied"], [])

    def test_each_gap_costs_one_point(self):
        out = measure.score(self._row(rate_in_artifact=False), 9)
        self.assertEqual(out["ethical_robustness_now"], 8)
        out = measure.score(
            self._row(rate_in_artifact=False, direction_disclosed=False), 9
        )
        self.assertEqual(out["ethical_robustness_now"], 7)

    def test_alignment_is_recorded_for_every_scored_candidate(self):
        for spec in measure.PROBE_SPECS:
            self.assertIn(spec["candidate"], measure.ALIGNMENT)
            adverse, why = measure.ALIGNMENT[spec["candidate"]]
            self.assertIsInstance(adverse, bool)
            self.assertTrue(why.strip())


class CommittedResult(unittest.TestCase):
    """Pin the four classifications, so closing a gap forces a re-run."""

    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads(RESULTS.read_text())
        cls.by_probe = {r["probe"]: r for r in cls.payload["disclosure"]}

    def test_no_artifact_carries_an_error_rate(self):
        self.assertEqual(self.payload["summary"]["rate_in_artifact"], 0)

    def test_scope_and_direction_split_as_recorded(self):
        self.assertEqual(self.payload["summary"]["scope_disclosed"], 2)
        self.assertEqual(self.payload["summary"]["direction_disclosed"], 1)

    def test_the_one_direction_disclosure_is_the_npm_probe(self):
        self.assertTrue(self.by_probe["npm-reachability-triage"]["direction_disclosed"])
        for other in ("eaa-wcag-triage", "source-silence-detector", "agent-permission-harness"):
            self.assertFalse(self.by_probe[other]["direction_disclosed"])

    def test_two_probes_have_no_record_module_at_all(self):
        missing = [r["probe"] for r in self.payload["disclosure"] if r["record_module"] is None]
        self.assertEqual(sorted(missing), ["agent-permission-harness", "source-silence-detector"])

    def test_scores_land_where_the_readme_says(self):
        got = {s["candidate"]: s["ethical_robustness_now"] for s in self.payload["scoring"]}
        self.assertEqual(
            got,
            {
                "eaa-remediation-pipeline": 6,
                "cra-evidence-desk": 6,
                "public-record-watch": 6,
                "agent-permission-harness": 7,
            },
        )

    def test_a_second_committed_number_for_the_same_probe_is_also_absent(self):
        """`a11y-axe-recall/` landed on main the same day, with recall 0.975.

        Two committed accuracy numbers for one probe now, and the artifact
        carries neither. Pinned separately from the precision citation because
        it is a different measurement in a different directory.
        """
        reference = Path(__file__).resolve().parents[1] / "a11y-axe-recall" / "README.md"
        self.assertIn("recall is 0.975", reference.read_text())
        text, _, _ = measure.render_eaa()
        self.assertNotIn("0.975", text)

    def test_no_candidate_crossed_the_gate(self):
        for entry in self.payload["scoring"]:
            self.assertGreaterEqual(entry["ethical_robustness_now"], 5)


class Reproducible(unittest.TestCase):
    def test_rerun_matches_the_committed_file(self):
        """Offline, no clock read: the same inputs give the same answer."""
        committed = json.loads(RESULTS.read_text())
        for spec in measure.PROBE_SPECS:
            with self.subTest(probe=spec["probe"]):
                row = measure.evaluate(spec)
                want = next(
                    r for r in committed["disclosure"] if r["probe"] == spec["probe"]
                )
                for key in (
                    "scope_disclosed",
                    "direction_disclosed",
                    "rate_in_artifact",
                    "record_module",
                    "direction_evidence",
                ):
                    self.assertEqual(row[key], want[key], key)
                self.assertEqual(
                    measure.score(row, spec["prior"])["ethical_robustness_now"],
                    next(
                        s["ethical_robustness_now"]
                        for s in committed["scoring"]
                        if s["candidate"] == spec["candidate"]
                    ),
                )


if __name__ == "__main__":
    unittest.main()
