"""Tests for the contrast-decidability measurement.

Standard-library ``unittest``, no install step, no network, matching the other
research directories. These check the *measurement*, not the engine — the
engine's own 112 tests live beside it in
``portfolio/pipeline/probes/eaa-wcag-triage/tests/``.

The committed results file is checked here too. It is a published number, and a
results file that no longer matches its own summary is the failure mode that
lets a stale figure survive into a README.
"""

import json
import unittest
from pathlib import Path

import measure

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results-2026-08-21.json"


class CorpusSelection(unittest.TestCase):
    def test_framework_shells_are_excluded(self):
        """`a11y-own-sites` measured these as 100% un-actionable."""
        self.assertIn("_global-error.html", measure.FRAMEWORK_SHELLS)
        self.assertIn("500.html", measure.FRAMEWORK_SHELLS)

    def test_pages_are_deduplicated_by_content(self):
        pages = measure.venture_pages("local-site-studio")
        if not pages:
            self.skipTest("no build present; run npm run build first")
        digests = {path.read_bytes() for path in pages}
        self.assertEqual(len(digests), len(pages))

    def test_stylesheet_is_read_from_the_build(self):
        css = measure.venture_css("local-site-studio")
        if not css:
            self.skipTest("no build present; run npm run build first")
        # The whole finding rests on the stylesheet being part of the artifact.
        self.assertIn("--color-", css)


class Summary(unittest.TestCase):
    def test_summarise_computes_the_decidable_share(self):
        rows = [
            {
                "pages": 2,
                "both_schemes": {"pass": 8, "fail": 1, "undecidable": 1},
                "light_only": {"pass": 9, "fail": 0, "undecidable": 1},
                "undecidable_reasons": {"opacity-in-chain": 1},
            }
        ]
        totals = measure.summarise(rows)
        self.assertEqual(totals["elements"], 10)
        self.assertEqual(totals["decidable_share"], 0.9)

    def test_dark_only_failures_are_the_difference_between_the_two_passes(self):
        rows = [
            {
                "pages": 1,
                "both_schemes": {"pass": 5, "fail": 5, "undecidable": 0},
                "light_only": {"pass": 8, "fail": 2, "undecidable": 0},
                "undecidable_reasons": {},
            }
        ]
        self.assertEqual(measure.summarise(rows)["dark_only_failures"], 3)

    def test_empty_input_does_not_divide_by_zero(self):
        totals = measure.summarise([])
        self.assertIsNone(totals["decidable_share"])


class CommittedResults(unittest.TestCase):
    def setUp(self):
        self.results = json.loads(RESULTS.read_text())

    def test_totals_match_the_per_venture_rows(self):
        recomputed = measure.summarise(self.results["ventures"])
        self.assertEqual(recomputed, self.results["totals"])

    def test_every_undecidable_reason_is_one_the_engine_can_emit(self):
        """A reason the engine no longer produces means a stale results file."""
        from wcag_triage import contrast as C

        for reason in self.results["totals"]["undecidable_reasons"]:
            self.assertIn(reason, C.UNDECIDABLE_REASONS)

    def test_report_renders_from_the_committed_file(self):
        text = measure.report(self.results)
        self.assertIn("TOTAL", text)
        self.assertIn("dark mode", text)

    def test_the_headline_share_is_what_the_readme_quotes(self):
        self.assertEqual(self.results["totals"]["decidable_share"], 0.9876)
        self.assertEqual(self.results["totals"]["dark_only_failures"], 384)

    def test_the_open_venture_failures_are_the_ones_the_readme_names(self):
        """The three ventures with open AA failures, at the counts on `main`.

        These are remediations, not measurement defects, and each is held
        separately: the `local-site-studio` and `ai-first-markets` colour-token
        fixes are venture source that only the account owner may merge, and
        `print-atelier`'s 611 are 73 component-level colour decisions. When any
        of them lands, this test fails and the results file has to be
        regenerated against the rebuilt corpus — which is the point. The
        committed artifact is only worth keeping while it still describes the
        tree it was measured from.
        """
        by_name = {row["venture"]: row for row in self.results["ventures"]}
        expected = {
            "local-site-studio": 21,
            "ai-first-markets": 333,
            "print-atelier": 611,
            "quick-pick-survey": 0,
        }
        for name, count in expected.items():
            self.assertEqual(by_name[name]["both_schemes"].get("fail", 0), count, name)


if __name__ == "__main__":
    unittest.main()
