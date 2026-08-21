"""Tests for the engine-agreement reconciliation.

Standard-library `unittest`, no install step, no network:

    python3 -m unittest discover
"""

from __future__ import annotations

import json
import pathlib
import tempfile
import unittest

import reconcile

RESULTS = pathlib.Path(__file__).resolve().parent / "results-2026-08-21.json"


class SilentGapLogic(unittest.TestCase):
    """The comparison itself, on synthetic catalogs."""

    def test_a_criterion_the_other_checks_and_this_one_ignores_is_a_gap(self):
        a = {"checked": {"1.1.1"}, "declared_untested": set()}
        b = {"checked": {"1.1.1", "1.2.2"}, "declared_untested": set()}
        self.assertEqual(reconcile.silent_gaps(a, b), ["1.2.2"])

    def test_disclosing_it_as_untested_is_not_a_gap(self):
        a = {"checked": {"1.1.1"}, "declared_untested": {"1.2.2"}}
        b = {"checked": {"1.1.1", "1.2.2"}, "declared_untested": set()}
        self.assertEqual(reconcile.silent_gaps(a, b), [])

    def test_checking_it_is_not_a_gap(self):
        a = {"checked": {"1.1.1", "1.2.2"}, "declared_untested": set()}
        b = {"checked": {"1.2.2"}, "declared_untested": set()}
        self.assertEqual(reconcile.silent_gaps(a, b), [])

    def test_the_comparison_is_directional(self):
        a = {"checked": {"1.1.1"}, "declared_untested": set()}
        b = {"checked": {"1.2.2"}, "declared_untested": set()}
        self.assertEqual(reconcile.silent_gaps(a, b), ["1.2.2"])
        self.assertEqual(reconcile.silent_gaps(b, a), ["1.1.1"])


class NumberParsing(unittest.TestCase):
    def test_criterion_number_is_taken_from_the_head_of_the_string(self):
        self.assertEqual(reconcile._number("1.2.2 Captions (Prerecorded)"), "1.2.2")
        self.assertEqual(reconcile._number("4.1.2 Name, Role, Value"), "4.1.2")


class LiveEngines(unittest.TestCase):
    """The regression the fix exists to hold: no *coverage* gap comes back."""

    def setUp(self):
        self.a = reconcile.audit_catalog()
        self.b = reconcile.probe_catalog()

    def test_captions_are_covered_by_both_engines(self):
        self.assertIn("1.2.2", self.a["checked"])
        self.assertIn("1.2.2", self.b["checked"])

    def test_audio_control_and_resize_text_are_covered_by_both(self):
        for criterion in ("1.4.2", "1.4.4"):
            self.assertIn(criterion, self.a["checked"], criterion)
            self.assertIn(criterion, self.b["checked"], criterion)

    def test_the_only_remaining_gaps_are_the_two_known_attribution_splits(self):
        # 2.4.6 and 3.3.2 are not coverage gaps: both engines detect the
        # underlying defect. They differ on which criterion to cite it under,
        # which is a normative reading this environment cannot settle against
        # a primary source. Recorded in the README as open, and pinned here so
        # a real coverage gap cannot hide behind them.
        self.assertEqual(reconcile.silent_gaps(self.a, self.b), ["2.4.6"])
        self.assertEqual(reconcile.silent_gaps(self.b, self.a), ["3.3.2"])

    def test_both_engines_detect_every_shared_defect_class(self):
        for row in reconcile.attribution_table():
            self.assertTrue(row["audit_py"], f"audit.py missed {row['defect']}")
            self.assertTrue(row["probe"], f"probe missed {row['defect']}")

    def test_ten_of_twelve_defect_classes_agree_on_the_criterion(self):
        rows = reconcile.attribution_table()
        disagree = sorted(r["defect"] for r in rows if not r["agree"])
        self.assertEqual(
            disagree, ["form control with no label", "skipped heading level"])


class CorpusOutsideTheRepo(unittest.TestCase):
    """`--corpus` accepts any directory, including one outside the repo.

    The interesting corpora are exactly those: a build-output tree, a
    downloaded theme. Naming every page relative to the repo root made each
    such run raise before it reported a single comparison.
    """

    def test_a_page_inside_the_repo_is_named_relative_to_it(self):
        page = reconcile.DEFAULT_CORPUS / "shop-accessible.html"
        self.assertEqual(
            reconcile._label(page),
            "portfolio/pipeline/probes/eaa-wcag-triage/fixtures/shop-accessible.html")

    def test_a_page_outside_the_repo_keeps_its_absolute_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            page = pathlib.Path(tmp) / "page.html"
            page.write_text("<html lang='en'><title>t</title></html>")
            self.assertEqual(reconcile._label(page), str(page))

    def test_a_corpus_outside_the_repo_is_compared_rather_than_raising(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "page.html").write_text(
                "<html lang='en'><head><title>t</title></head>"
                "<body><img src='x.png'></body></html>")
            result = reconcile.corpus_agreement(root)
            self.assertEqual(result["files"], 1)
            self.assertEqual(result["per_file"][0]["probe"], {"1.1.1": 1})


class CommittedResults(unittest.TestCase):
    """The saved file must still describe the engines as they are now."""

    def test_results_file_matches_a_live_run(self):
        saved = json.loads(RESULTS.read_text())
        live = reconcile.measure(reconcile.DEFAULT_CORPUS)
        self.assertEqual(saved["silent_gaps"], live["silent_gaps"])
        self.assertEqual(saved["attribution"], live["attribution"])
        self.assertEqual(saved["catalogs"], live["catalogs"])

    def test_summary_recomputes_offline_from_the_saved_file(self):
        saved = json.loads(RESULTS.read_text())
        self.assertIn("Silent coverage gaps", reconcile.summarise(saved))


if __name__ == "__main__":
    unittest.main()
