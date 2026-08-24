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

# 2026-08-22: four of the eight became rules in `eaa-wcag-triage`. The split is
# not "the easy ones" -- it is the ones a *default* `axe.run()` actually
# reports as violations, established by running axe rather than by reading its
# rule list. See Finding 5 and `AXE_DEFAULT_RUN_VERDICTS` below.
#
# Later the same day 1.4.1 joined them, and for a few hours the split was
# exactly "axe reports it by default" against "axe never runs a rule for it",
# with no criterion left in between.
#
# 2.5.3 then broke that coincidence, and breaking it is the point. The split
# above was never a decision rule -- what a default `axe.run()` executes is
# evidence about axe, not about whether a barrier is decidable from the
# artifact. 2.5.3's own catalog note had said "decidable from the markup"
# since the row was written, and it is: a control that takes its name from its
# content, carrying an `aria-label` that does not contain the text on the
# control, is two strings and a comparison. It is now a rule, and it is the
# first criterion either engine here decides that a default reference run does
# not report at all. The containment that survives is one-directional and is
# the one worth pinning: everything axe reports by default is implemented.
IMPLEMENTED = ["1.3.4", "1.4.1", "2.2.1", "2.2.2", "2.4.1", "2.5.3", "3.1.2"]
# Implemented despite the reference never running a rule for it. Kept separate
# so the assertions below can still say which side of the axe line each row
# sits on without implying the line decided anything. 1.3.4 joins 2.5.3 here:
# `css-orientation-lock` ships experimental and off, same as
# `label-content-name-mismatch`, and the probe's own catalog note had called
# the criterion decidable from the CSS since the row was written.
IMPLEMENTED_BEYOND_THE_REFERENCE = ["1.3.4", "2.5.3"]
STILL_UNIMPLEMENTED = ["1.2.1"]

# What axe-core 4.13.0 does with each fixture below, measured on 2026-08-22 by
# running it in Chromium (see `a11y-axe-recall/` for the harness). Recorded as
# data because the unit tests here are offline and cannot re-run a browser:
# these are the observations the Finding 5 write-up rests on, pinned so a
# future edit to a fixture has to restate them.
#
#   "violation"  - a default axe.run() reports it
#   "incomplete" - axe matches the page but declines to decide it
#   "pass"       - axe evaluates the markup and finds no failure
#   "off"        - every axe rule for the criterion ships disabled or
#                  experimental, so a default run never executes it
AXE_DEFAULT_RUN_VERDICTS = {
    "1.2.1": "off",
    "1.3.4": "off",
    "1.4.1": "violation",
    "2.2.1": "violation",
    "2.2.2": "violation",
    "2.4.1": "violation",
    "2.5.3": "off",
    "3.1.2": "violation",
    "1.3.5": "violation",
}

DEFECTS = {
    "1.2.1": ("", '<audio controls src="a.mp3"></audio>'),
    "1.3.4": ("<style>@media(orientation:portrait){html{transform:rotate(90deg)}}</style>",
              "<p>x</p>"),
    # eaa-wcag-triage's rule requires a *decidable* colour on both the link
    # and the text around it -- it will not assume a browser's default black
    # for an element with no declared colour at all (the same refusal 1.4.3
    # makes). The original fixture left the <p> undeclared and this rule
    # correctly stayed silent on it; the explicit colour below is what a real
    # page almost always has (from its own reset) and is what axe itself
    # never needed declared to flag the fixture.
    "1.4.1": ("", '<p style="color:#333">See '
                  '<a href="/x" style="color:blue;text-decoration:none">this</a>.</p>'),
    "2.2.1": ('<meta http-equiv="refresh" content="5">', "<p>x</p>"),
    "2.2.2": ("", "<marquee>Sale!</marquee><blink>now</blink>"),
    # Corrected 2026-08-22. The original fixture here was
    #   <nav><a href='/a'>a</a></nav><main><p>x</p></main>
    # which contains a <main> landmark -- one of the three mechanisms axe's
    # `bypass` rule accepts. Run in a browser it does not fail that rule, it
    # *passes* it, so the assertion that both engines were silent on it held
    # for a reason unrelated to coverage. This fixture has a navigation block,
    # prose to skip to, and no mechanism of any kind.
    "2.4.1": ("", "<nav><a href='/a'>a</a><a href='/b'>b</a></nav><div><p>"
                  + ("Every order ships within two working days. " * 6)
                  + "</p></div>"),
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
# `main` immediately before the four rules landed -- the state the
# after-disclosure result file records.
BEFORE_RULES_REVISION = "7ce8473"


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
        self.assertEqual(disclosed, set(STILL_UNIMPLEMENTED))
        for row in self.data["disclosed_unimplemented"]:
            self.assertEqual(
                row["declared_unimplemented_by"], ["audit.py", "eaa-wcag-triage"])

    def test_a_criterion_one_engine_built_leaves_the_disclosure_list(self):
        # 2.5.3 is still probe-only. 1.4.1 was the same until 2026-08-24,
        # when `audit.py` gained the rule; both engines now claim it.
        # Neither is undisclosed nor a row both engines decline. The union
        # is what the customer's record is built from.
        disclosed = {r["criterion"] for r in self.data["disclosed_unimplemented"]}
        claimed = {r["criterion"]: r["claimed_by"] for r in self.data["depth"]}
        for criterion in ("1.4.1", "2.5.3"):
            with self.subTest(criterion=criterion):
                self.assertIn(criterion, self.data["union_checked"])
                self.assertNotIn(criterion, disclosed)
        self.assertEqual(claimed["1.4.1"], ["audit.py", "eaa-wcag-triage"])
        self.assertEqual(claimed["2.5.3"], ["eaa-wcag-triage"])

    def test_the_implemented_criteria_are_now_checked_not_disclosed(self):
        # They left the disclosure list by being built, which is the only way
        # a row is allowed to leave it.
        checked = set(self.data["union_checked"])
        for criterion in IMPLEMENTED:
            self.assertIn(criterion, checked, criterion)


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
        for criterion in STILL_UNIMPLEMENTED:
            with self.subTest(criterion=criterion):
                self.assertIn(criterion, DEFECTS,
                              "no defect fixture for a reported gap")
                head, body = DEFECTS[criterion]
                found = self._criteria_found(WRAPPER.format(head=head, body=body))
                self.assertNotIn(criterion, found)

    def test_the_implemented_criteria_are_genuinely_detected(self):
        # The other direction, and the one that has to hold now: a criterion
        # whose coverage value moved off "unimplemented" must actually fire on
        # the same fixture that documented it as a gap. Without this, a row
        # could be relabelled without a rule behind it -- the exact failure
        # the `unimplemented` vocabulary was introduced to prevent. It covers
        # 2.5.3 on exactly the fixture that documented it, which is the whole
        # reason that fixture was written before any rule existed.
        for criterion in IMPLEMENTED:
            with self.subTest(criterion=criterion):
                head, body = DEFECTS[criterion]
                found = self._criteria_found(WRAPPER.format(head=head, body=body))
                self.assertIn(criterion, found)

    def test_everything_the_reference_reports_by_default_is_implemented(self):
        # The direction that has to hold, and the only one that ever carried
        # information: a criterion a default `axe.run()` reports as a violation
        # is one a free scanner would hand the merchant, so an engine that
        # sells an evidence record cannot be silent on it. This is the
        # regression guard -- if a later pass removes one of these rules, or a
        # newly-disclosed row turns out to be a default axe violation and is
        # left unbuilt, it fails here.
        for criterion in AS_FOUND_GAPS:
            if AXE_DEFAULT_RUN_VERDICTS[criterion] == "violation":
                self.assertIn(criterion, IMPLEMENTED, criterion)

    def test_the_reverse_containment_is_false_and_that_is_the_finding(self):
        # For a few hours on 2026-08-22 the split was exactly "axe reports it"
        # against "axe does not", and the write-up read that coincidence as
        # though it were the rule that decided what to build. It was not: what
        # the reference executes is a fact about the reference. 2.5.3 is the
        # row that separates the two claims -- decidable from the markup by its
        # own catalog note, and never reported by a default axe run.
        for criterion in IMPLEMENTED_BEYOND_THE_REFERENCE:
            self.assertIn(criterion, IMPLEMENTED, criterion)
            self.assertEqual(AXE_DEFAULT_RUN_VERDICTS[criterion], "off",
                             criterion)

    def test_what_is_left_unimplemented_is_not_explained_by_axe_alone(self):
        # The one remaining row is a criterion a default axe run never
        # executes either, so no engine anywhere reports it. That is still
        # true and still worth stating -- but after 2.5.3 and 1.3.4 it is no
        # longer the *reason* it is unbuilt: it is genuinely undecidable from
        # the artifact, not merely unbuilt because axe declines to run a rule.
        for criterion in STILL_UNIMPLEMENTED:
            self.assertEqual(AXE_DEFAULT_RUN_VERDICTS[criterion], "off",
                             criterion)
        # 1.3.4 was decidable from the CSS and has a rule now; 1.2.1 is the
        # only row left because the artifact itself cannot answer it (no
        # transcript is present in static markup to judge).
        self.assertEqual(STILL_UNIMPLEMENTED, ["1.2.1"])

    def test_criteria_axe_does_not_run_by_default_are_marked_in_the_catalog(self):
        # The catalog half of the same fact, derived from the committed
        # reference rather than from the table above.
        reference = measure.load_reference()
        off = {c for c in reference["rules"] if not reference["default_run_rules"][c]}
        self.assertEqual(off, {"1.2.1", "1.3.4", "2.5.3", "2.5.8"})

    def test_disclosure_did_not_quietly_become_detection(self):
        # The remediation added rows to two coverage statements and no rules.
        # If a later pass implements one, this test fails and the coverage
        # value has to move off "unimplemented" — which is the point of
        # keeping that value distinct from "manual".
        declared = measure.probe_catalog()["declared_unimplemented"]
        self.assertEqual(declared, set(STILL_UNIMPLEMENTED))

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

    @unittest.skipUnless(_revision_available(BEFORE_RULES_REVISION),
                         "revision %s not in this checkout" % BEFORE_RULES_REVISION)
    def test_after_disclosure_file_re_derives_from_its_revision(self):
        # Addressed by revision from 2026-08-22 rather than by "worktree".
        # It records the state disclosure left behind -- eight rows declared
        # and no rule for any of them -- and that state is now history: four
        # of the eight are rules. A file pinned to the worktree would have had
        # to be overwritten to keep its own test passing, which would have
        # erased the before-state this module exists to compare against.
        committed = self._load("results-2026-08-21-after-disclosure.json")
        self.assertEqual(committed["measured_at_revision"], BEFORE_RULES_REVISION)
        self.assertEqual(committed, measure.measure(BEFORE_RULES_REVISION))

    def test_after_rules_file_matches_the_worktree(self):
        committed = self._load("results-2026-08-22-after-rules.json")
        self.assertEqual(committed["measured_at_revision"], "worktree")
        self.assertEqual(committed, measure.measure())

    def test_summary_renders_offline(self):
        text = measure.summarise(self._load("results-2026-08-21-as-found.json"))
        self.assertIn("UNDISCLOSED", text)
        self.assertIn("2.4.1", text)


if __name__ == "__main__":
    unittest.main()
