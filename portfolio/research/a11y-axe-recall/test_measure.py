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
        # 1.2.1 is the example that survives: axe's only rule for it ships
        # disabled and returns incomplete even forced on, and neither engine
        # has a rule either, so nothing in this corpus has anything to say
        # about it. 2.4.1 stood here until 2026-08-22, 1.4.1 until later the
        # same day, and 2.5.3 and 1.3.4 until later again — and those two left
        # for a different reason than the first three. 2.4.1/1.4.1 were
        # criteria axe reports by default that neither engine looked for.
        # 2.5.3 and 1.3.4 are criteria axe still does not report at all: the
        # probe built them because their own catalog notes had always said
        # they were decidable from the markup, which is a claim about the
        # artifact rather than about what the reference happens to run.
        self.assertNotIn("1.2.1", checked)
        self.assertIn("1.4.1", checked)
        self.assertIn("2.5.3", checked)
        self.assertIn("1.3.4", checked)

    def test_the_criteria_implemented_on_2026_08_22_are_now_in_scope(self):
        # They moved from "declared unimplemented" to "checked", so axe
        # findings on them now count for or against recall instead of being
        # set aside as a known coverage gap. 1.4.1 is the one that changes an
        # actual number here: it is the only one of the six that axe reports
        # anywhere in this corpus. 2.5.3 cannot change a number in either
        # direction — a default axe run never executes a rule for it, so
        # entering scope adds a criterion this corpus can never score.
        checked = measure.checked_criteria()
        for criterion in ("1.4.1", "2.2.1", "2.2.2", "2.4.1", "2.5.3", "3.1.2"):
            self.assertIn(criterion, checked, criterion)

    def test_use_of_color_is_in_scope_and_the_snapshot_was_re_run(self):
        """The one criterion whose implementation could only be settled by a run.

        When 1.4.1 was first implemented, this test recorded an open question:
        the committed results file was a frozen browser pass taken *before* the
        rule existed, so nothing here could say whether the rule catches the
        real instance — only that the criterion had entered scope. That
        question is answered rather than still open: the corpus was rebuilt
        from all 7 applications and axe-core 4.13.0 re-run over all 118 pages,
        the snapshot regenerated from that run, and the instance is matched.

        Both halves are asserted, because "in scope" and "actually caught" are
        different claims and the first one alone is what a stale snapshot can
        support.
        """
        self.assertIn("1.4.1", measure.checked_criteria())
        data = json.loads(RESULTS.read_text())
        matched = [(r["app"], r["page"]) for r in data["per_page"]
                   if "1.4.1" in r["matched"]]
        self.assertEqual(
            matched, [("ventures/photo-editing/docs-site", "index.html")])

    def test_the_snapshots_universe_lags_by_2_5_3_and_cannot_matter(self):
        """The committed file is a frozen browser pass; 2.5.3 and 1.3.4 entered scope after it.

        1.4.1 set the precedent that a criterion entering scope means re-running
        the corpus, because axe reports 1.4.1 and the number moved. 2.5.3 and
        1.3.4 are the case where that reasoning does not carry: a default
        `axe.run()` never executes a rule for either of them, so there is no
        instance for the universe to newly include, and a rebuild of all 7
        applications would reproduce this file field for field.

        Rather than leave that as an unstated difference between the snapshot
        and the worktree, both halves are asserted here — the lag is exactly
        these two criteria, and axe emitted nothing for either anywhere in the
        corpus. If a future axe version turns `label-content-name-mismatch` or
        `css-orientation-lock` on by default, the second half fails and the
        corpus has to be re-run.
        """
        data = json.loads(RESULTS.read_text())
        live = measure.checked_criteria()
        self.assertEqual(live - set(data["checked_criteria"]), {"1.3.4", "2.5.3"})
        emitted = set()
        for row in data["per_page"]:
            emitted |= set(row["axe_all_criteria"])
        self.assertNotIn("2.5.3", emitted)
        self.assertNotIn("1.3.4", emitted)


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
        # 2.2.2, 2.4.1 and 3.1.2 and they became claims this measurement
        # holds the engines to; 18 later the same day, when 1.4.1 joined them.
        self.assertEqual(len(self.data["checked_criteria"]), 18)
        for criterion in ("1.4.1", "2.2.1", "2.2.2", "2.4.1", "3.1.2"):
            self.assertIn(criterion, self.data["checked_criteria"])

    def test_widening_the_claim_did_not_cost_recall(self):
        # The four criteria added to the universe on 2026-08-22 brought no
        # new axe-flagged instances with them: axe reports none of them
        # anywhere in this corpus, so the denominator is unchanged at 40 and
        # recall stays 0.975. Claiming more did not mean missing more --
        # which is the direction that would have mattered.
        rows = self.data["per_page"]
        new_rules = {"2.2.1", "2.2.2", "2.4.1", "3.1.2"}
        flagged = [c for r in rows for c in r["axe_checked_criteria"] if c in new_rules]
        self.assertEqual(flagged, [])

    def test_recall_after_the_stylesheet_fix(self):
        rows = self.data["per_page"]
        total = sum(len(r["axe_checked_criteria"]) for r in rows)
        matched = sum(len(r["matched"]) for r in rows)
        missed = sum(len(r["missed"]) for r in rows)
        # 40/39/1 until 1.4.1 entered the universe carrying one axe instance
        # with it, which the probe matches: a wider claim, the same single
        # miss. See `test_widening_the_claim_to_1_4_1_was_matched_not_missed`.
        self.assertEqual(total, 41)
        self.assertEqual(matched, 40)
        self.assertEqual(missed, 1)

    def test_widening_the_claim_to_1_4_1_was_matched_not_missed(self):
        """The one criterion whose implementation changed a number here.

        Widening a coverage claim is only safe if the engine can actually
        stand behind it, and this is the first time in this module's history
        that a newly-claimed criterion brought an axe finding into the
        denominator with it. It is corroborated on the same page and the same
        node, not merely uncounted.
        """
        rows = [r for r in self.data["per_page"] if "1.4.1" in r["axe_checked_criteria"]]
        self.assertEqual(
            [(r["app"], r["page"], r["matched"]) for r in rows],
            [("ventures/photo-editing/docs-site", "index.html", ["1.4.1"])],
        )

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
        # a11y-external-coverage-reference — not a new class of finding, and
        # both are criteria whose coverage row says a human is needed. 1.4.1
        # was the third until it was implemented; it is now inside the
        # universe and matched.
        self.assertEqual(outside, {"2.1.1", "2.1.3"})


if __name__ == "__main__":
    unittest.main()
