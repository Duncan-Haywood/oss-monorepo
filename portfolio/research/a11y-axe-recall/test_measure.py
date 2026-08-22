"""Tests for the axe-core recall pass.

Standard-library `unittest`, no install step, no network, no browser:

    python3 -m unittest discover

Three groups. The first pins the axe-core rule catalog and checked-criteria
lookup against small hand-built inputs. The second is a behavioural guard on
the bug this module exists to avoid repeating: `a11y-own-sites/`'s adapters
call both engines with no stylesheet, so contrast (1.4.3) never fires on a
corpus that is 100% linked CSS — this pins that the *fixed* adapters here
actually change the answer on a synthetic low-contrast page, so a future edit
that quietly drops the stylesheet argument fails a test instead of silently
re-introducing the bug. The third pins the saved run's headline numbers.
"""

from __future__ import annotations

import json
import pathlib
import unittest

import measure

RESULTS = pathlib.Path(__file__).resolve().parent / "results-2026-08-22.json"


class AxeCatalog(unittest.TestCase):
    def test_rule_criteria_maps_a_known_rule(self):
        table = measure.axe_rule_criteria()
        self.assertIn("4.1.2", table["button-name"])

    def test_rules_with_no_success_criterion_are_absent(self):
        table = measure.axe_rule_criteria()
        # A purely best-practice rule (no WCAG SC at all) was never in the
        # committed catalog to begin with — see a11y-external-coverage-reference.
        self.assertNotIn("landmark-one-main", table)


class CheckedCriteria(unittest.TestCase):
    def test_is_the_union_of_both_engines_automated_and_partial_rows(self):
        checked = measure.checked_criteria()
        # 1.4.3 (Contrast) is "partial" in the probe's own COVERAGE catalog —
        # the whole point of this module is that it is checkable, not manual.
        self.assertIn("1.4.3", checked)
        # A criterion either engine declines as manual/unimplemented is not
        # "checked", even if axe-core automates it (a11y-external-coverage-reference).
        # 1.4.1 stood here as the sharp example (axe-core reports it by
        # default and fires once on this corpus) until 2026-08-22, when
        # eaa-wcag-triage built a rule for it and it moved to "checked" —
        # see test_the_five_criteria_implemented_on_2026_08_22_are_now_in_scope.
        self.assertNotIn("2.5.3", checked)

    def test_the_five_criteria_implemented_on_2026_08_22_are_now_in_scope(self):
        # They moved from "declared unimplemented" to "checked", so axe
        # findings on them now count for or against recall instead of being
        # set aside as a known coverage gap. 2.2.1/2.2.2/2.4.1/3.1.2 landed
        # earlier the same day; 1.4.1 (Use of Color) landed later that day,
        # in a second, separate change.
        checked = measure.checked_criteria()
        for criterion in ("1.4.1", "2.2.1", "2.2.2", "2.4.1", "3.1.2"):
            self.assertIn(criterion, checked, criterion)


class StylesheetMatters(unittest.TestCase):
    """The bug: without a stylesheet, 1.4.3 finds nothing to decide at all."""

    LOW_CONTRAST_PAGE = (
        "<html lang='en'><head><title>t</title>"
        "<link rel='stylesheet' href='/style.css'></head>"
        "<body><p class='muted'>some body text long enough to matter</p>"
        "</body></html>"
    )
    # #777 on #666 is well under the 4.5:1 AA threshold for 16px body text.
    CSS = "body{background:#666} .muted{color:#777}"

    def test_no_stylesheet_means_no_contrast_finding(self):
        probe = measure.probe_criteria_with_css(self.LOW_CONTRAST_PAGE, None)
        audit = measure.audit_py_criteria_with_css(self.LOW_CONTRAST_PAGE, None)
        self.assertNotIn("1.4.3", probe)
        self.assertNotIn("1.4.3", audit)

    def test_with_the_linked_stylesheet_both_engines_catch_it(self):
        import audit as audit_py  # already on sys.path via `measure`
        sheet = audit_py.merge_stylesheets([self.CSS])
        probe = measure.probe_criteria_with_css(self.LOW_CONTRAST_PAGE, sheet)
        audit = measure.audit_py_criteria_with_css(self.LOW_CONTRAST_PAGE, sheet)
        self.assertIn("1.4.3", probe)
        self.assertIn("1.4.3", audit)


class SavedResults(unittest.TestCase):
    """Pin the numbers the README quotes to the saved run."""

    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(RESULTS.read_text())

    def test_corpus_matches_a11y_own_sites(self):
        corpus = self.data["corpus"]
        self.assertEqual(corpus["pages_unique"], 118)
        self.assertEqual(len(corpus["apps"]), 7)

    def test_checked_criteria_universe(self):
        # 13 until 2026-08-22, when `eaa-wcag-triage` implemented 2.2.1,
        # 2.2.2, 2.4.1 and 3.1.2 (-> 17), then later the same day implemented
        # 1.4.1 (Use of Color) too (-> 18). All five became claims this
        # measurement holds the engines to.
        self.assertEqual(len(self.data["checked_criteria"]), 18)
        for criterion in ("1.4.1", "2.2.1", "2.2.2", "2.4.1", "3.1.2"):
            self.assertIn(criterion, self.data["checked_criteria"])

    def test_widening_the_claim_did_not_cost_recall(self):
        # The four criteria added to the universe earlier on 2026-08-22
        # brought no new axe-flagged instances with them: axe reports none of
        # them anywhere in this corpus. 1.4.1, added later the same day, is
        # different -- it is exactly the criterion axe already flagged once
        # on this corpus (photo-editing/docs-site), and the new rule catches
        # that same instance, so it becomes a match, not a miss. See
        # test_recall_after_the_1_4_1_rule for the resulting counts.
        rows = self.data["per_page"]
        new_rules_with_no_instances = {"2.2.1", "2.2.2", "2.4.1", "3.1.2"}
        flagged = [
            c for r in rows for c in r["axe_checked_criteria"]
            if c in new_rules_with_no_instances
        ]
        self.assertEqual(flagged, [])

    def test_recall_after_the_1_4_1_rule(self):
        # 39/40 = 0.975 until 2026-08-22, when eaa-wcag-triage built the 1.4.1
        # rule and it started counting: axe's one 1.4.1 instance on this
        # corpus moves from "outside the checked universe" to "checked and
        # matched", so the denominator and the matched count both rise by 1.
        rows = self.data["per_page"]
        total = sum(len(r["axe_checked_criteria"]) for r in rows)
        matched = sum(len(r["matched"]) for r in rows)
        missed = sum(len(r["missed"]) for r in rows)
        self.assertEqual(total, 41)
        self.assertEqual(matched, 40)
        self.assertEqual(missed, 1)

    def test_the_one_surviving_miss_is_the_already_contested_checkbox(self):
        rows = self.data["per_page"]
        misses = [(r["app"], r["page"], r["missed"]) for r in rows if r["missed"]]
        self.assertEqual(misses, [
            ("ventures/real-estate-agent-photo-app/docs-site", "strategy.html", ["4.1.2"]),
        ])

    def test_axe_findings_outside_the_checked_universe_are_known_gaps(self):
        checked = set(self.data["checked_criteria"])
        outside = set()
        for r in self.data["per_page"]:
            outside |= set(r["axe_all_criteria"]) - checked
        # 2.1.1/2.1.3 are named, already-disclosed gaps in
        # a11y-external-coverage-reference — not a new class of finding.
        # 1.4.1 stood here too until 2026-08-22, when eaa-wcag-triage built a
        # rule for it and its one corpus instance moved into the checked
        # universe as a match (see test_recall_after_the_1_4_1_rule).
        self.assertEqual(outside, {"2.1.1", "2.1.3"})


if __name__ == "__main__":
    unittest.main()
