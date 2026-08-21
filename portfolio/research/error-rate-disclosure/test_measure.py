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

    def test_a_decimal_point_does_not_end_a_sentence(self):
        """The bug that surfaced the moment an artifact printed a rate.

        D2 quotes every match "so the classification can be checked rather than
        trusted". Splitting "precision 0.821-0.881" into ``["**Precision 0.",
        "881, recall 0."]`` keeps the boolean right and makes the evidence
        uncheckable, which is the half that matters.
        """
        self.assertEqual(
            measure.sentences("Precision is 0.821-0.881 here. Next one!"),
            ["Precision is 0.821-0.881 here.", "Next one!"],
        )

    def test_a_newline_still_ends_a_sentence(self):
        self.assertEqual(measure.sentences("a.\nb."), ["a.", "b."])
        self.assertEqual(measure.sentences("a\nb."), ["b."])

    def test_direction_evidence_is_whole_sentences(self):
        """No quoted match may be a fragment ending mid-number."""
        for spec in measure.PROBE_SPECS:
            text, _, _ = spec["render"]()
            for hit in measure.direction_matches(text):
                with self.subTest(probe=spec["probe"], hit=hit[:40]):
                    self.assertFalse(
                        hit.rstrip().endswith(tuple(f"{d}." for d in "0123456789")),
                        f"fragment ends on a decimal point: {hit!r}",
                    )

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

    def test_full_disclosure_costs_nothing_even_when_alignment_is_adverse(self):
        """The case the original suite never exercised.

        This class's ``_row`` defaults to ``agent-permission-harness``, the one
        candidate whose alignment is *not* adverse, so the test above passed
        while ``score`` was charging deduction 3 unconditionally — meaning an
        adverse-aligned probe could not cross the gate by disclosing, which is
        the opposite of what the published rubric asks. The rubric's own wording
        is "the *undisclosed* direction". Pinned here on a candidate where the
        distinction bites.
        """
        for candidate in ("eaa-remediation-pipeline", "cra-evidence-desk", "public-record-watch"):
            with self.subTest(candidate=candidate):
                self.assertTrue(measure.ALIGNMENT[candidate][0], "expected adverse")
                out = measure.score(self._row(candidate=candidate), 9)
                self.assertEqual(out["deductions_applied"], [])
                self.assertEqual(out["ethical_robustness_now"], 9)
                # The reading of the business model is unchanged and still
                # recorded; what changed is whether it is charged.
                self.assertTrue(out["alignment_adverse"])
                self.assertFalse(out["alignment_charged"])

    def test_each_gap_costs_one_point(self):
        out = measure.score(self._row(rate_in_artifact=False), 9)
        self.assertEqual(out["ethical_robustness_now"], 8)
        out = measure.score(
            self._row(rate_in_artifact=False, direction_disclosed=False), 9
        )
        self.assertEqual(out["ethical_robustness_now"], 7)

    def test_hiding_an_adverse_direction_still_costs_two(self):
        """Deduction 3 is conditional, not removed: concealment is still charged."""
        out = measure.score(
            self._row(candidate="eaa-remediation-pipeline", direction_disclosed=False), 9
        )
        self.assertEqual(
            out["deductions_applied"], ["direction_undisclosed", "adverse_alignment"]
        )
        self.assertEqual(out["ethical_robustness_now"], 7)
        self.assertTrue(out["alignment_charged"])

    def test_alignment_is_recorded_for_every_scored_candidate(self):
        for spec in measure.PROBE_SPECS:
            self.assertIn(spec["candidate"], measure.ALIGNMENT)
            adverse, why = measure.ALIGNMENT[spec["candidate"]]
            self.assertIsInstance(adverse, bool)
            self.assertTrue(why.strip())


class CommittedResult(unittest.TestCase):
    """Pin the four classifications, so a gap opening *or* closing forces a re-run.

    These pinned the all-gaps-open state this directory first measured. One gap
    has since been closed — ``eaa-wcag-triage`` now prints both of its committed
    figures — so they pin the post-fix state instead. The historical result is
    not lost: it is the "was" column in every ``measured:`` block this pass
    wrote, and the narrative is in the README's own amendment.
    """

    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads(RESULTS.read_text())
        cls.by_probe = {r["probe"]: r for r in cls.payload["disclosure"]}

    def test_three_probes_with_a_committed_rate_now_print_it(self):
        """``agent-permission-harness`` joined the other two on 2026-08-21.

        Until then only ``eaa-wcag-triage`` and ``source-silence-detector`` had
        both a committed rate and printed it — ``agent-permission-harness`` had
        no rate to commit at all. ``validate_accuracy.py`` closed that: it now
        has a committed figure (its own README) and prints it.
        """
        self.assertEqual(self.payload["summary"]["rate_in_artifact"], 3)
        for probe in ("eaa-wcag-triage", "source-silence-detector", "agent-permission-harness"):
            with self.subTest(probe=probe):
                self.assertTrue(self.by_probe[probe]["rate_in_artifact"])

    def test_the_remaining_one_has_no_rate_to_print(self):
        """The distinction that decides what work each one needs.

        Withholding a measured rate is a rendering gap. Never having measured
        one is a measurement gap, and no amount of rendering closes it.
        ``npm-reachability-triage`` is now the only probe in the second class:
        its own record already names its adverse direction, but the rate for
        that direction has never been measured, so there is still no figure to
        print.
        """
        probe = "npm-reachability-triage"
        self.assertFalse(self.by_probe[probe]["rate_in_artifact"])
        self.assertIsNone(self.by_probe[probe]["rate_committed"])
        self.assertTrue(self.by_probe[probe]["rate_absent_because"].strip())

    def test_scope_and_direction_split_as_recorded(self):
        # agent-permission-harness now declares ACCURACY_NOTE at module level
        # in harness.py and both discloses direction and prints its rate, so
        # both counts moved from 3 to 4 on 2026-08-21.
        self.assertEqual(self.payload["summary"]["scope_disclosed"], 4)
        self.assertEqual(self.payload["summary"]["direction_disclosed"], 4)

    def test_direction_is_disclosed_by_every_probe_with_a_record_module(self):
        for probe in (
            "npm-reachability-triage",
            "eaa-wcag-triage",
            "source-silence-detector",
            "agent-permission-harness",
        ):
            with self.subTest(probe=probe):
                self.assertTrue(self.by_probe[probe]["direction_disclosed"])

    def test_no_probe_lacks_a_record_module_any_more(self):
        """``agent-permission-harness`` was the last one without a record module.

        ``harness.render_markdown()`` is that probe's only customer-facing
        artifact — there is no separate module the way ``evidence.py`` or
        ``subscriber_record.py`` are for the other three — so this pass points
        ``render_harness()`` at ``harness.py`` itself, which now declares
        ``ACCURACY_NOTE``.
        """
        missing = [r["probe"] for r in self.payload["disclosure"] if r["record_module"] is None]
        self.assertEqual(missing, [])

    def test_the_silence_detector_never_renders_no_alert_as_health(self):
        """The mitigation for an error the customer structurally cannot see.

        This product's miss is unobservable from outside — a subscriber sees the
        same silence whether the register is quiet or the watch failed — so the
        rate alone is not enough. The record has to say what its own silence is
        worth.
        """
        text, _, _ = measure.render_silence()
        self.assertIn("NO ALERT FROM US IS NOT EVIDENCE THAT A REGISTER IS ACTIVE", text)
        self.assertIn("a miss costs us nothing and is invisible to you", text)

    def test_scores_land_where_the_readme_says(self):
        got = {s["candidate"]: s["ethical_robustness_now"] for s in self.payload["scoring"]}
        self.assertEqual(
            got,
            {
                "eaa-remediation-pipeline": 9,
                "cra-evidence-desk": 7,
                "public-record-watch": 9,
                "agent-permission-harness": 9,
            },
        )

    def test_both_committed_numbers_for_the_eaa_probe_now_reach_the_artifact(self):
        """`a11y-own-sites/` and `a11y-axe-recall/` measured the two directions.

        Both are now printed. Pinned against the source READMEs as well as the
        artifact, so a figure revised upstream cannot leave a stale number in a
        customer-facing record — the probe's own
        ``tests/test_accuracy_citations.py`` enforces the same thing from the
        other side.
        """
        research = Path(__file__).resolve().parents[1]
        self.assertIn(
            "recall is 0.975", (research / "a11y-axe-recall" / "README.md").read_text()
        )
        self.assertIn(
            "out-of-sample precision is **0.821–0.881**",
            (research / "a11y-own-sites" / "README.md").read_text(),
        )
        text, _, _ = measure.render_eaa()
        self.assertIn("0.975", text)
        self.assertIn("0.821", text)

    def test_the_probe_that_closed_its_gap_names_the_direction_that_pays_it(self):
        """Deduction 3's mitigation, checked in the artifact rather than assumed."""
        text, _, _ = measure.render_eaa()
        self.assertIn("over-reporting is the error that would pay us", text)

    def test_the_harness_states_its_measured_figure_and_its_own_limits(self):
        """agent-permission-harness closed its gap on 2026-08-21 too.

        Checked directly against the rendered artifact rather than only via the
        boolean, so a future edit that keeps ``direction_disclosed`` true for
        the wrong reason (e.g. an unrelated sentence matching the vocabulary)
        is still caught.
        """
        text, _, _ = measure.render_harness()
        self.assertIn("0 false positives, 0 false negatives", text)
        self.assertIn("16/34", text)
        # The honest limit has to survive alongside the number: this corpus is
        # author-authored, not held-out, and says nothing about attack classes
        # outside R1-R7.
        self.assertIn("not an out-of-sample estimate", text)
        self.assertIn("unmeasured", text)

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
