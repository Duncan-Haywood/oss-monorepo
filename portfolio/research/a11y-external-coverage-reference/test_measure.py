#!/usr/bin/env python3
"""Tests for the external-coverage-reference measurement.

The test that matters is `TestGapsAreReal`. Every other module in this
repository that compares coverage statements compares *tables*, and a table
comparison can report a gap the code does not have -- an engine may check
something its catalog forgot to mention, which is a documentation bug pointing
the opposite way. So each criterion this module reports as undisclosed is also
run as defect markup through both engines, and the claim is only allowed to
stand if both engines are genuinely silent on it.
"""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))

import measure  # noqa: E402


# Defect markup for every criterion in the undisclosed set, plus the two
# over-declined ones an engine could plausibly have caught. Each is a failure
# an automated rule in axe-core 4.13.0 reports.
WRAPPER = '<html lang="en"><head><title>t</title>{head}</head><body>{body}</body></html>'

AS_FOUND_GAPS = ["1.2.1", "1.3.4", "1.4.1", "2.2.1",
                 "2.2.2", "2.4.1", "2.5.3", "3.1.2"]

DEFECTS = {
    "1.2.1": ("", '<audio controls src="a.mp3"></audio>'),
    "1.3.4": ("<style>@media(orientation:portrait){html{transform:rotate(90deg)}}</style>",
              "<p>x</p>"),
    "1.4.1": ("", '<p>See <a href="/x" style="color:blue;text-decoration:none">this</a>.</p>'),
    "2.2.1": ('<meta http-equiv="refresh" content="5">', "<p>x</p>"),
    "2.2.2": ("", "<marquee>Sale!</marquee><blink>now</blink>"),
    "2.4.1": ("", "<nav><a href='/a'>a</a></nav><main><p>x</p></main>"),
    "2.5.3": ("", '<button aria-label="Submit order">Buy now</button>'),
    "3.1.2": ("", '<p lang="engl">bonjour</p>'),
    "1.3.5": ("", '<label for="e">Email</label><input id="e" autocomplete="emailaddress">'),
}


def _engines():
    sys.path.insert(0, str(ROOT / "portfolio/research/a11y-evidence-record"))
    sys.path.insert(0, str(ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/src"))
    import audit
    from wcag_triage.engine import audit_html
    return audit, audit_html


class TestReference(unittest.TestCase):
    def setUp(self):
        self.reference = measure.load_reference()

    def test_pinned_version(self):
        self.assertEqual(self.reference["axe_core_version"], "4.13.0")

    def test_only_a_and_aa_in_scope(self):
        self.assertEqual(
            set(self.reference["level"].values()) - {"A", "AA"}, set())

    def test_multi_criterion_only_levels_are_not_guessed(self):
        # 2.1.3 (AAA) is reachable in axe-core only through
        # `scrollable-region-focusable`, which is also tagged 2.1.1. Deriving a
        # criterion's level from such a rule would pull an AAA criterion into
        # A/AA scope and inflate the gap count by one.
        self.assertNotIn("2.1.3", self.reference["rules"])

    def test_known_rule_mapping(self):
        self.assertIn("bypass", self.reference["rules"]["2.4.1"])
        self.assertEqual(self.reference["level"]["2.4.1"], "A")


class TestCatalogParsers(unittest.TestCase):
    def test_probe_catalog_splits_manual_from_checked(self):
        cat = measure.probe_catalog()
        self.assertIn("1.1.1", cat["checked"])
        self.assertIn("1.4.11", cat["declared_untested"])
        self.assertEqual(cat["checked"] & cat["declared_untested"], set())

    def test_audit_catalog_drops_prose_rows(self):
        cat = measure.audit_catalog()
        self.assertIn("3.3.2", cat["checked"])
        self.assertIn("1.4.10", cat["declared_untested"])
        # NOT_TESTED carries two rows naming no criterion; a criterion number
        # is required, so neither may appear.
        for entry in cat["declared_untested"]:
            self.assertTrue(entry[:1].isdigit(), entry)

    def test_parsers_read_source_not_imports(self):
        # Passing source directly must work, so the statement can be read at an
        # arbitrary revision without importing that revision's code.
        src = "COVERAGE: tuple = (Criterion('9.9.9', 'n', 'A', 'manual'),)\n"
        self.assertEqual(measure.probe_catalog(src)["declared_untested"], {"9.9.9"})


# The revision at which the gaps were found, before they were disclosed. The
# measurement changes the thing it measures, so the as-found result is pinned
# to a revision rather than to a file nobody can re-derive.
AS_FOUND_REVISION = "ab81715"


class TestCompare(unittest.TestCase):
    def setUp(self):
        self.data = measure.measure()

    def test_undisclosed_is_disjoint_from_both_lists(self):
        checked = set(self.data["union_checked"])
        declared = set(self.data["union_declared_untested"])
        for row in self.data["undisclosed"]:
            self.assertNotIn(row["criterion"], checked)
            self.assertNotIn(row["criterion"], declared)

    def test_over_declined_rows_name_who_declined(self):
        for row in self.data["over_declined"]:
            self.assertTrue(row["disclosed_by"])

    def test_depth_is_ordered_widest_first(self):
        counts = [row["axe_rule_count"] for row in self.data["depth"]]
        self.assertEqual(counts, sorted(counts, reverse=True))

    def test_headline_numbers(self):
        # Pinned so a change to either engine's coverage statement shows up as
        # a failing test rather than as a silently different README.
        self.assertEqual(self.data["reference_criteria"], 22)
        widest = self.data["depth"][0]
        self.assertEqual(widest["criterion"], "4.1.2")
        self.assertEqual(widest["axe_rule_count"], 29)

    def test_nothing_is_undisclosed_on_the_worktree(self):
        # The remediation this measurement prompted. If a later change to
        # either engine reopens a silent gap, this is the test that says so.
        self.assertEqual(self.data["undisclosed"], [])

    def test_the_eight_are_disclosed_as_unimplemented_not_as_manual(self):
        # Disclosing them as "manual" would have been a second false claim --
        # they are decidable, and the contractor step does not cover them.
        disclosed = {r["criterion"] for r in self.data["disclosed_unimplemented"]}
        self.assertEqual(disclosed, set(AS_FOUND_GAPS))
        for row in self.data["disclosed_unimplemented"]:
            self.assertEqual(
                row["declared_unimplemented_by"], ["audit.py", "eaa-wcag-triage"])


def _revision_available(revision=AS_FOUND_REVISION):
    """Is the as-found revision in this checkout?

    A shallow clone (`actions/checkout` defaults to depth 1) does not have it.
    CI for this directory sets `fetch-depth: 0` so these tests really run;
    skipping is for a contributor's shallow clone, and says which flag fixes it
    rather than passing quietly.
    """
    try:
        measure.source_at(revision, measure.AUDIT_PY)
        return True
    except Exception:
        return False


@unittest.skipUnless(
    _revision_available(),
    "revision %s not in this checkout — clone with full history "
    "(fetch-depth: 0) to run the as-found comparison" % AS_FOUND_REVISION,
)
class TestAsFound(unittest.TestCase):
    """The measurement as it stood before the gaps were disclosed."""

    def setUp(self):
        self.data = measure.measure(AS_FOUND_REVISION)

    def test_eight_undisclosed_six_of_them_level_a(self):
        self.assertEqual(
            [r["criterion"] for r in self.data["undisclosed"]], AS_FOUND_GAPS)
        self.assertEqual(
            sum(1 for r in self.data["undisclosed"] if r["level"] == "A"), 6)

    def test_no_criterion_was_disclosed_as_unimplemented_before(self):
        # The vocabulary did not exist at that revision.
        self.assertEqual(self.data["disclosed_unimplemented"], [])


class TestGapsAreReal(unittest.TestCase):
    """A reported gap must be a gap in the code, not only in the table."""

    @classmethod
    def setUpClass(cls):
        audit, audit_html = _engines()
        cls.audit = audit
        # staticmethod: a plain function assigned to a class attribute would
        # bind, and the engine would be handed the test case as its markup.
        cls.audit_html = staticmethod(audit_html)
        cls.data = measure.measure()

    def _criteria_found(self, html):
        found = {f["success_criterion"].split()[0]
                 for f in self.audit.audit_source(html, "probe.html")["findings"]}
        found |= {f.criterion for f in self.audit_html(html).findings}
        return found

    def test_every_reported_gap_is_genuinely_undetected(self):
        for criterion in AS_FOUND_GAPS:
            with self.subTest(criterion=criterion):
                self.assertIn(criterion, DEFECTS,
                              "no defect fixture for a reported gap")
                head, body = DEFECTS[criterion]
                found = self._criteria_found(WRAPPER.format(head=head, body=body))
                self.assertNotIn(criterion, found)

    def test_disclosure_did_not_quietly_become_detection(self):
        # The remediation added rows to two coverage statements and no rules.
        # If a later pass implements one, this test fails and the coverage
        # value has to move off "unimplemented" — which is the point of
        # keeping that value distinct from "manual".
        declared = measure.probe_catalog()["declared_unimplemented"]
        self.assertEqual(declared, set(AS_FOUND_GAPS))

    def test_fixtures_are_defective_enough_to_be_worth_running(self):
        # Guards the opposite failure: an empty fixture would pass the test
        # above for the wrong reason.
        for criterion, (head, body) in DEFECTS.items():
            with self.subTest(criterion=criterion):
                self.assertTrue(body.strip())


class TestCommittedResults(unittest.TestCase):
    def _load(self, name):
        return json.loads((HERE / name).read_text(encoding="utf-8"))

    @unittest.skipUnless(_revision_available(), "shallow clone")
    def test_as_found_file_re_derives_from_its_revision(self):
        committed = self._load("results-2026-08-21-as-found.json")
        self.assertEqual(committed["measured_at_revision"], AS_FOUND_REVISION)
        self.assertEqual(committed, measure.measure(AS_FOUND_REVISION))

    def test_after_disclosure_file_matches_the_worktree(self):
        committed = self._load("results-2026-08-21-after-disclosure.json")
        self.assertEqual(committed["measured_at_revision"], "worktree")
        self.assertEqual(committed, measure.measure())

    def test_summary_renders_offline(self):
        text = measure.summarise(self._load("results-2026-08-21-as-found.json"))
        self.assertIn("UNDISCLOSED", text)
        self.assertIn("2.4.1", text)


if __name__ == "__main__":
    unittest.main()
