"""Pin the host-theme close-rate measurement.

Run from this directory or via the a11y-generated-sites shim:

    python3 -m unittest discover -s ventures/local-site-studio/scripts/eaa-evidence-job
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from close_rate import (
    LIMITS,
    PAGES,
    RESULTS,
    apply_mechanical_defects,
    load_page,
    measure,
)

from wcag_triage.engine import audit_html
from wcag_triage.mechanical_fix import apply_mechanical_fixes


class UnmodifiedPages(unittest.TestCase):
    def test_three_named_themes(self):
        self.assertEqual(len(PAGES), 3)

    def test_unmodified_pages_have_no_findings(self):
        for name in PAGES:
            counts = audit_html(load_page(name)).counts()
            self.assertEqual(counts, {"total": 0, "blocking": 0, "degrading": 0}, name)


class MutatedCloseRate(unittest.TestCase):
    def test_injected_defects_are_exactly_the_four_rewriteable_classes(self):
        html = apply_mechanical_defects(load_page(PAGES[0]))
        findings = audit_html(html).findings
        criteria = sorted(f.criterion for f in findings)
        self.assertEqual(criteria, ["1.4.4", "2.4.2", "2.4.6", "4.1.2"])

    def test_pass_closes_every_injected_finding_and_invents_no_words(self):
        raw = load_page(PAGES[0])
        result = apply_mechanical_fixes(apply_mechanical_defects(raw))
        self.assertEqual(result.after.counts(), {"total": 0, "blocking": 0, "degrading": 0})
        self.assertEqual(result.blocking_close_rate(), 1.0)
        self.assertNotIn('lang="en-US"', result.html)
        self.assertNotIn("<img", result.html)
        applied = {p.criterion for p in result.applied}
        self.assertEqual(applied, {"1.4.4", "2.4.2", "2.4.6", "4.1.2"})

    def test_aggregate_close_rate_is_one_on_injected_blocking(self):
        report = measure()
        self.assertIsNone(report["unmodified"]["blocking_close_rate"])
        self.assertEqual(report["unmodified"]["blocking"], 0)
        mutated = report["mutated_mechanical_only"]
        self.assertEqual(mutated["before"], {"total": 12, "blocking": 6, "degrading": 6})
        self.assertEqual(mutated["after"], {"total": 0, "blocking": 0, "degrading": 0})
        self.assertEqual(mutated["blocking_close_rate"], 1.0)
        self.assertEqual(mutated["limits"], list(LIMITS))

    def test_limits_refuse_the_kill_criterion_and_content_invention(self):
        text = " ".join(LIMITS)
        self.assertIn("kill criterion", text)
        self.assertIn("not a live customer shop", text)
        self.assertIn("Does not invent alt text", text)
        self.assertIn("four defect classes", text)


class CommittedResults(unittest.TestCase):
    def test_committed_file_matches_a_fresh_measurement(self):
        committed = json.loads(RESULTS.read_text(encoding="utf-8"))
        fresh = measure()
        self.assertEqual(committed["unmodified"], fresh["unmodified"])
        self.assertEqual(
            committed["mutated_mechanical_only"]["before"],
            fresh["mutated_mechanical_only"]["before"],
        )
        self.assertEqual(
            committed["mutated_mechanical_only"]["after"],
            fresh["mutated_mechanical_only"]["after"],
        )
        self.assertEqual(
            committed["mutated_mechanical_only"]["blocking_close_rate"],
            fresh["mutated_mechanical_only"]["blocking_close_rate"],
        )
        self.assertEqual(committed["pages"], list(PAGES))
        self.assertTrue(Path(RESULTS).is_file())


if __name__ == "__main__":
    unittest.main()
