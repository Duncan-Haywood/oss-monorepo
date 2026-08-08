#!/usr/bin/env python3
"""
Unit and contract tests for the SAST gate.

Most of these assert the failing direction. A scanner that reports success is
worth nothing on its own — the repository already had four of those, each
passing for a component it never verified — so what is tested here is that the
gate fails on a new finding, on a stale waiver, on an expired one, on a shrinking
scan surface, and on a missing tool.

The last group are contract tests against the real `platform/sast-baseline.yaml`:
they are what make this run on every push rather than only when someone
remembers to.
"""

import importlib.util
import json
import re
import sys
import tempfile
import unittest
from datetime import date, timedelta
from collections import Counter
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]

# Loaded by path rather than by inserting scripts/ci onto sys.path and importing
# it. The sys.path version needs an inline linter suppression on every import
# that follows, and `scripts/ci/audit_exceptions.py` correctly reports those as
# unregistered. Two waivers to import a module is a worse trade than one
# explicit loader.
#
# The module has to be in sys.modules *before* it executes: it uses
# `@dataclass`, which resolves field types via
# `sys.modules[cls.__module__].__dict__` and raises AttributeError on None if
# the module is not registered yet.
_spec = importlib.util.spec_from_file_location(
    "sast_scan", REPO_ROOT / "scripts" / "ci" / "sast_scan.py"
)
sast_scan = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = sast_scan
_spec.loader.exec_module(sast_scan)

MAX_EXPIRY_DAYS = sast_scan.MAX_EXPIRY_DAYS
REQUIRED_FIELDS = sast_scan.REQUIRED_FIELDS
Finding = sast_scan.Finding
Located = sast_scan.Located
ScanError = sast_scan.ScanError
check_parse_coverage = sast_scan.check_parse_coverage
reconcile = sast_scan.reconcile
run_bandit = sast_scan.run_bandit
run_semgrep = sast_scan.run_semgrep
validate_entries = sast_scan.validate_entries

TODAY = date(2026, 8, 1)
BASELINE_PATH = REPO_ROOT / "platform" / "sast-baseline.yaml"


def _as_date(value):
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def entry(**overrides):
    base = {
        "id": "SAST-TEST",
        "tool": "semgrep",
        "rule": "some.rule.id",
        "path": "ventures/example/src/thing.ts",
        "count": 1,
        "owner": "duncan",
        "issue": "docs/SAST.md#sast-test",
        "reason": " ".join(["word"] * 25),
        "expires": (TODAY + timedelta(days=30)).isoformat(),
        "status": "reviewed",
    }
    base.update(overrides)
    return base


def located(rule="some.rule.id", path="ventures/example/src/thing.ts", tool="semgrep", line=1):
    return Located(
        finding=Finding(tool=tool, rule=rule, path=path),
        line=line,
        message="",
        severity="WARNING",
    )


class ValidateEntriesTests(unittest.TestCase):
    def test_complete_entry_is_accepted(self):
        self.assertEqual(validate_entries([entry()], TODAY), [])

    def test_every_required_field_is_required(self):
        for field in REQUIRED_FIELDS:
            with self.subTest(field=field):
                problems = validate_entries([entry(**{field: None})], TODAY)
                self.assertTrue(
                    any(field in problem for problem in problems),
                    f"dropping {field} produced no problem: {problems}",
                )

    def test_expired_entry_fails(self):
        problems = validate_entries(
            [entry(expires=(TODAY - timedelta(days=1)).isoformat())], TODAY
        )
        self.assertTrue(any("expired" in problem for problem in problems), problems)

    def test_expiry_beyond_the_horizon_fails(self):
        problems = validate_entries(
            [entry(expires=(TODAY + timedelta(days=MAX_EXPIRY_DAYS + 1)).isoformat())],
            TODAY,
        )
        self.assertTrue(any("maximum" in problem for problem in problems), problems)

    def test_expiry_exactly_at_the_horizon_is_allowed(self):
        problems = validate_entries(
            [entry(expires=(TODAY + timedelta(days=MAX_EXPIRY_DAYS)).isoformat())],
            TODAY,
        )
        self.assertEqual(problems, [])

    def test_unknown_tool_fails(self):
        problems = validate_entries([entry(tool="checkov")], TODAY)
        self.assertTrue(any("tool must be" in problem for problem in problems), problems)

    def test_duplicate_id_fails(self):
        problems = validate_entries([entry(), entry(path="other/file.ts")], TODAY)
        self.assertTrue(any("duplicate id" in problem for problem in problems), problems)

    def test_unknown_status_fails(self):
        problems = validate_entries([entry(status="probably-fine")], TODAY)
        self.assertTrue(any("status must be" in problem for problem in problems), problems)

    def test_reviewed_entry_with_a_thin_reason_fails(self):
        """The whole point of `reviewed`: it costs something to claim."""
        problems = validate_entries([entry(reason="false positive")], TODAY)
        self.assertTrue(any("at least" in problem for problem in problems), problems)

    def test_inherited_entry_needs_no_long_reason_but_does_need_a_plan(self):
        self.assertEqual(
            validate_entries(
                [entry(status="inherited", reason="not assessed", plan="fix the thing")],
                TODAY,
            ),
            [],
        )
        problems = validate_entries([entry(status="inherited", reason="not assessed")], TODAY)
        self.assertTrue(any("needs a `plan`" in problem for problem in problems), problems)

    def test_non_positive_count_fails(self):
        for bad in (0, -1, "1", True):
            with self.subTest(count=bad):
                problems = validate_entries([entry(count=bad)], TODAY)
                self.assertTrue(
                    any("count must be" in problem for problem in problems), problems
                )


class ReconcileTests(unittest.TestCase):
    def test_registered_finding_at_the_declared_count_passes(self):
        self.assertEqual(reconcile([located()], [entry()]), [])

    def test_unregistered_finding_fails(self):
        problems = reconcile([located(rule="brand.new.rule")], [entry()])
        self.assertTrue(any("unregistered finding" in p for p in problems), problems)

    def test_same_rule_in_a_different_file_is_unregistered(self):
        """The waiver is per file on purpose: a new file must not inherit one."""
        problems = reconcile([located(path="ventures/example/src/other.ts")], [entry()])
        self.assertTrue(any("unregistered finding" in p for p in problems), problems)

    def test_same_rule_from_a_different_tool_is_unregistered(self):
        problems = reconcile([located(tool="bandit")], [entry()])
        self.assertTrue(any("unregistered finding" in p for p in problems), problems)

    def test_more_occurrences_than_declared_fails(self):
        problems = reconcile([located(line=1), located(line=9)], [entry(count=1)])
        self.assertTrue(any("now occurs 2x" in p for p in problems), problems)

    def test_fewer_occurrences_than_declared_fails_as_stale(self):
        problems = reconcile([located(line=1)], [entry(count=2)])
        self.assertTrue(any("stale baseline entry" in p for p in problems), problems)

    def test_vanished_finding_fails_as_stale(self):
        """A waiver whose subject is fixed must be deleted, not left to cover the next one."""
        problems = reconcile([], [entry()])
        self.assertTrue(any("no longer" in p for p in problems), problems)

    def test_clean_scan_against_an_empty_baseline_passes(self):
        self.assertEqual(reconcile([], []), [])


class LowCountReMeasurementTests(unittest.TestCase):
    """The gate must not turn a contended measurement into a register edit.

    Measured 2026-08-08 on one byte-identical tree at load average 387-406.
    Two full scans whose *unparsed sets were byte-identical* still disagreed on
    the counts: `unsafe-formatstring` in the Stripe webhook route came back 13
    then 7, and `detect-child-process` in `platform/ci/src/pipeline.mjs` 3 then
    4. Semgrep raised neither an error nor a warning. Scanning the webhook
    route alone, three times, at the same load: 13, 13, 13.

    So the low number was the machine, and the message the gate printed for it
    was "occurs 7x but the baseline reserves 13. Lower the count." — a one-line
    edit that permanently under-reserves a real finding and goes green.
    """

    def test_a_low_count_that_does_not_reproduce_is_not_reported(self):
        # Full scan says 1, the file on its own says 2, register reserves 2.
        # The register was right and the run was contended: say nothing.
        problems = reconcile([located(line=1)], [entry(count=2)], recount=lambda f: 2)
        self.assertEqual(
            problems,
            [],
            "a count the isolated re-measurement contradicts must not be reported; "
            "reporting it is what invites lowering the register to it",
        )

    def test_a_low_count_that_does_reproduce_is_still_reported(self):
        # The ratchet in the other direction has to survive: if the finding
        # really was fixed, the stale waiver must still be struck.
        problems = reconcile([located(line=1)], [entry(count=2)], recount=lambda f: 1)
        self.assertTrue(
            any("stale baseline entry" in p and "occurs 1x" in p for p in problems), problems
        )

    def test_a_vanished_finding_confirmed_absent_is_still_reported(self):
        problems = reconcile([], [entry(count=1)], recount=lambda f: 0)
        self.assertTrue(any("no longer" in p for p in problems), problems)

    def test_re_measurement_finding_more_than_the_register_fails(self):
        # Contention hid a real new occurrence. This must not pass quietly just
        # because the full scan happened to report fewer.
        problems = reconcile([located(line=1)], [entry(count=2)], recount=lambda f: 5)
        self.assertTrue(any("occurs 5x when re-measured" in p for p in problems), problems)

    def test_an_unverifiable_tool_falls_back_to_the_full_scan_number(self):
        # `recount` returns None for bandit; behaviour must be exactly what it
        # was before this path existed.
        problems = reconcile([located(tool="bandit", line=1)], [entry(tool="bandit", count=2)],
                             recount=lambda f: None)
        self.assertTrue(any("stale baseline entry" in p for p in problems), problems)

    def test_high_counts_are_never_re_measured(self):
        """The suppressing path must be unreachable from the failing direction.

        A finding occurring *more* often than the register reserves is a new
        occurrence. If `recount` could be consulted there, a contended
        re-measurement could erase it — so it is never called at all, and this
        pins that rather than trusting the branch to stay where it is.
        """
        calls = []

        def recount(finding):
            calls.append(finding)
            return 0

        problems = reconcile(
            [located(line=1), located(line=9)], [entry(count=1)], recount=recount
        )
        self.assertEqual(calls, [], "the over-count direction must never be re-measured")
        self.assertTrue(any("now occurs 2x" in p for p in problems), problems)

    def test_non_reproducible_re_measurement_raises_rather_than_choosing(self):
        """Two isolated measurements that disagree are not evidence.

        `isolated_recount` raises `ScanError` here; `main` turns that into
        exit 2, "could not run", rather than exit 1, "found something". The
        alternative — reporting the lower of the two — is precisely how the
        register gets ratcheted down by machine load.
        """
        def recount(finding):
            raise ScanError("re-measuring produced different counts")

        with self.assertRaises(ScanError):
            reconcile([located(line=1)], [entry(count=2)], recount=recount)


class IsolatedRecountTests(unittest.TestCase):
    """`isolated_recount` itself — the part that decides what counts as evidence."""

    def setUp(self):
        self._real = sast_scan.semgrep_counts_for_file
        self.addCleanup(setattr, sast_scan, "semgrep_counts_for_file", self._real)
        self.calls = []

    def _stub(self, *results):
        queue = list(results)

        def fake(root, relative):
            self.calls.append(relative)
            return Counter(queue.pop(0))

        sast_scan.semgrep_counts_for_file = fake

    def test_two_agreeing_measurements_are_believed(self):
        self._stub({"rule.a": 13}, {"rule.a": 13})
        recount = sast_scan.isolated_recount(Path("/repo"))
        self.assertEqual(recount(Finding(tool="semgrep", rule="rule.a", path="src/x.ts")), 13)
        self.assertEqual(len(self.calls), 2, "the file must be measured twice, not once")

    def test_two_disagreeing_measurements_raise(self):
        self._stub({"rule.a": 13}, {"rule.a": 7})
        recount = sast_scan.isolated_recount(Path("/repo"))
        with self.assertRaises(ScanError) as caught:
            recount(Finding(tool="semgrep", rule="rule.a", path="src/x.ts"))
        self.assertIn("13 then 7", str(caught.exception))

    def test_a_rule_absent_from_the_file_counts_zero(self):
        self._stub({"rule.a": 2}, {"rule.a": 2})
        recount = sast_scan.isolated_recount(Path("/repo"))
        self.assertEqual(recount(Finding(tool="semgrep", rule="other", path="src/x.ts")), 0)

    def test_bandit_is_not_re_measured(self):
        self._stub()
        recount = sast_scan.isolated_recount(Path("/repo"))
        self.assertIsNone(recount(Finding(tool="bandit", rule="B108", path="src/x.py")))
        self.assertEqual(self.calls, [], "bandit has no observed flap and no semgrep to re-run")

    def test_one_file_is_measured_once_however_many_rules_ask(self):
        self._stub({"rule.a": 1, "rule.b": 2}, {"rule.a": 1, "rule.b": 2})
        recount = sast_scan.isolated_recount(Path("/repo"))
        recount(Finding(tool="semgrep", rule="rule.a", path="src/x.ts"))
        recount(Finding(tool="semgrep", rule="rule.b", path="src/x.ts"))
        self.assertEqual(len(self.calls), 2, "cached per file, so two rules cost one pair of scans")


class ParseCoverageTests(unittest.TestCase):
    """The parse-coverage check compares *sets*, not a count.

    The count could not settle. `docs/SAST.md` records two idle-machine scans
    minutes apart that both reported 54 files and not the same 54: one file left
    the set while an 812 KB TSX file entered it, untouched by either run,
    because at that size it sits on the parse-timeout boundary. The equality
    then went red with no code change, and the one-line way to green was to edit
    the number — the exact pressure this register exists to remove.

    `test_a_swap_fails` is the case the old form could not see and is the
    reason for the change: one file gained, one lost, count unmoved.
    """

    TODAY = date(2026, 8, 5)

    def coverage(self, declared, marginal=(), ceiling=None):
        block = {
            "semgrep_unparsed": list(declared),
            "semgrep_unparsed_max": len(declared) + len(marginal) if ceiling is None else ceiling,
        }
        if marginal:
            block["semgrep_unparsed_marginal"] = list(marginal)
        return {"coverage": block}

    def marginal(self, path, expires=date(2026, 12, 1)):
        return {
            "path": path,
            "why": "812 KB of TSX, on semgrep's parse-timeout boundary",
            "owner": "duncan",
            "expires": expires,
        }

    def test_the_declared_set_passes(self):
        self.assertEqual(
            check_parse_coverage(["a.ts", "b.ts"], self.coverage(["a.ts", "b.ts"]), self.TODAY),
            [],
        )

    def test_a_new_unparsed_file_fails(self):
        problems = check_parse_coverage(
            ["a.ts", "b.ts", "c.ts"], self.coverage(["a.ts", "b.ts"]), self.TODAY
        )
        self.assertTrue(any("newly stopped parsing" in p for p in problems), problems)
        self.assertTrue(any("c.ts" in p for p in problems), problems)

    def test_a_file_that_starts_parsing_again_must_be_struck(self):
        problems = check_parse_coverage(["a.ts"], self.coverage(["a.ts", "b.ts"]), self.TODAY)
        self.assertTrue(any("now parse cleanly" in p for p in problems), problems)
        self.assertTrue(any("b.ts" in p for p in problems), problems)

    def test_a_swap_fails(self):
        """One in, one out, count unchanged — invisible to the old equality."""
        problems = check_parse_coverage(
            ["a.ts", "c.ts"], self.coverage(["a.ts", "b.ts"]), self.TODAY
        )
        self.assertTrue(any("newly stopped parsing" in p and "c.ts" in p for p in problems), problems)
        self.assertTrue(any("now parse cleanly" in p and "b.ts" in p for p in problems), problems)

    def test_a_marginal_file_may_be_present_or_absent(self):
        document = self.coverage(["a.ts"], [self.marginal("big.tsx")])
        self.assertEqual(check_parse_coverage(["a.ts", "big.tsx"], document, self.TODAY), [])
        self.assertEqual(check_parse_coverage(["a.ts"], document, self.TODAY), [])

    def test_a_marginal_entry_without_an_expiry_fails(self):
        entry = self.marginal("big.tsx")
        del entry["expires"]
        problems = check_parse_coverage(
            ["a.ts", "big.tsx"], self.coverage(["a.ts"], [entry]), self.TODAY
        )
        self.assertTrue(any("no `expires:` date" in p for p in problems), problems)

    def test_an_expired_marginal_entry_fails(self):
        problems = check_parse_coverage(
            ["a.ts", "big.tsx"],
            self.coverage(["a.ts"], [self.marginal("big.tsx", date(2026, 8, 4))]),
            self.TODAY,
        )
        self.assertTrue(any("expired on 2026-08-04" in p for p in problems), problems)

    def test_a_marginal_entry_without_a_reason_or_owner_fails(self):
        for field in ("why", "owner"):
            entry = self.marginal("big.tsx")
            del entry[field]
            problems = check_parse_coverage(
                ["a.ts", "big.tsx"], self.coverage(["a.ts"], [entry]), self.TODAY
            )
            self.assertTrue(any(f"has no `{field}`" in p for p in problems), (field, problems))

    def test_the_declared_list_cannot_exceed_the_ceiling(self):
        problems = check_parse_coverage(
            ["a.ts", "b.ts"], self.coverage(["a.ts", "b.ts"], ceiling=1), self.TODAY
        )
        self.assertTrue(any("over the ceiling of 1" in p for p in problems), problems)

    def test_the_ceiling_counts_marginal_entries_too(self):
        """Otherwise the escape hatch is the way around the cap."""
        problems = check_parse_coverage(
            ["a.ts"], self.coverage(["a.ts"], [self.marginal("big.tsx")], ceiling=1), self.TODAY
        )
        self.assertTrue(any("over the ceiling of 1" in p for p in problems), problems)

    def test_missing_declaration_fails(self):
        problems = check_parse_coverage([], {}, self.TODAY)
        self.assertTrue(any("no `coverage.semgrep_unparsed`" in p for p in problems), problems)

    def test_a_non_list_declaration_fails(self):
        problems = check_parse_coverage([], {"coverage": {"semgrep_unparsed": 53}}, self.TODAY)
        self.assertTrue(any("must be a list of paths" in p for p in problems), problems)

    def test_non_integer_ceiling_fails(self):
        problems = check_parse_coverage(
            [], {"coverage": {"semgrep_unparsed": [], "semgrep_unparsed_max": "30"}}, self.TODAY
        )
        self.assertTrue(any("non-negative integer" in p for p in problems), problems)


class FailClosedTests(unittest.TestCase):
    """A missing tool must fail the gate, never silently report zero findings."""

    def test_missing_semgrep_raises(self):
        original = sast_scan.shutil.which
        sast_scan.shutil.which = lambda name: None
        try:
            with self.assertRaises(ScanError) as caught:
                run_semgrep(REPO_ROOT)
            self.assertIn("semgrep is not installed", str(caught.exception))
        finally:
            sast_scan.shutil.which = original

    def test_missing_bandit_raises(self):
        original = sast_scan.shutil.which
        sast_scan.shutil.which = lambda name: None
        try:
            with self.assertRaises(ScanError) as caught:
                run_bandit(REPO_ROOT)
            self.assertIn("bandit is not installed", str(caught.exception))
        finally:
            sast_scan.shutil.which = original


class ScanSurfaceTests(unittest.TestCase):
    """The scanners must not prune real source because of a directory's name.

    `EXCLUDED_DIRS` used to contain the bare names `dist` and `build`, pruned at
    any depth. `src/app/api/build/route.ts` is a Next.js App Router *route*, not
    build output, so the security scanner silently stopped reading it — the same
    incident `scripts/ci/route_posture_contract.py` records in the comment above
    `ARTIFACT_DIRS`, repeated in the control next door.

    Nothing here mocks the module under test. `classify_scan_surface` runs for
    real against a real directory tree; the subprocess boundary is the only
    thing stubbed, and only in the argv tests, so the classification and the
    command assembly the fix lives in are both genuinely executed.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self._write("ventures/v/src/app/api/build/route.ts", "export async function GET(){}\n")
        self._write("ventures/v/src/app/api/build/handler.py", "import subprocess\n")
        self._write("ventures/v/src/app/api/ok/route.ts", "export async function GET(){}\n")
        self._write("ventures/v/dist/bundle.js", "export function run(x){ return eval(x); }\n")
        self._write("ventures/v/build/out.js", "export function run(x){ return eval(x); }\n")
        self._write("ventures/v/node_modules/pkg/index.js", "module.exports = 1;\n")
        self.surface = sast_scan.classify_scan_surface(self.root)

    def _write(self, relative, text):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def test_build_output_outside_an_app_tree_is_still_excluded(self):
        """The prune is scoped, not removed. Vendored output stays out."""
        self.assertIn("ventures/v/dist", self.surface.artifact_dirs)
        self.assertIn("ventures/v/build", self.surface.artifact_dirs)

    def test_an_app_router_directory_named_build_is_not_excluded(self):
        """`/api/build` is a URL segment. Excluding it removes a live endpoint."""
        self.assertNotIn("ventures/v/src/app/api/build", self.surface.artifact_dirs)

    def test_source_under_an_app_router_build_segment_is_handed_to_the_scanner(self):
        """Semgrep's own default ignore drops `build/` at any depth whatever
        flags we pass, so dropping our exclude is not enough on its own: the
        files have to be named as explicit scanning roots."""
        self.assertIn("ventures/v/src/app/api/build/route.ts", self.surface.shadowed_files)
        self.assertIn("ventures/v/src/app/api/build/handler.py", self.surface.shadowed_files)

    def test_real_build_output_is_never_handed_back_as_a_scanning_root(self):
        """The mirror: re-including everything would be as wrong as excluding it."""
        for path in self.surface.shadowed_files:
            self.assertFalse(path.startswith("ventures/v/dist/"), path)
            self.assertFalse(path.startswith("ventures/v/build/"), path)

    def test_vendored_directories_are_recorded_by_path_not_by_bare_name(self):
        """bandit's `--exclude ./node_modules` matches the top level only."""
        self.assertIn("ventures/v/node_modules", self.surface.vendor_dirs)

    def _capture(self, runner):
        """Run `runner` against the probe tree, capturing argv instead of scanning."""
        captured = {}

        class _Completed:
            returncode = 0
            stdout = '{"results": [], "errors": [], "paths": {"scanned": []}}'
            stderr = ""

        def fake_run(command, **kwargs):
            captured["command"] = list(command)
            return _Completed()

        original_run = sast_scan.subprocess.run
        original_which = sast_scan.shutil.which
        sast_scan.subprocess.run = fake_run
        sast_scan.shutil.which = lambda name: f"/usr/bin/{name}"
        try:
            runner(self.root)
        finally:
            sast_scan.subprocess.run = original_run
            sast_scan.shutil.which = original_which
        return captured["command"]

    def test_semgrep_is_not_asked_to_exclude_the_bare_name_build(self):
        command = self._capture(sast_scan.run_semgrep)
        self.assertNotIn("--exclude=build", command)
        self.assertNotIn("--exclude=dist", command)
        self.assertIn("--exclude=ventures/v/build", command)
        self.assertIn("--exclude=ventures/v/dist", command)

    def test_semgrep_receives_the_shadowed_app_source_as_a_scanning_root(self):
        command = self._capture(sast_scan.run_semgrep)
        self.assertIn(str(self.root / "ventures/v/src/app/api/build/route.ts"), command)

    def test_too_much_shadowed_source_fails_rather_than_scanning_a_subset(self):
        """Silently scanning the first N would be the gate narrowing itself."""
        for index in range(sast_scan.MAX_SHADOWED_FILES + 1):
            self._write(f"ventures/v/src/app/api/build/f{index}.ts", "export const x = 1;\n")
        with self.assertRaises(sast_scan.ScanError) as caught:
            self._capture(sast_scan.run_semgrep)
        self.assertIn("Refusing to scan a silently truncated subset", str(caught.exception))

    def test_bandit_excludes_nested_build_output_by_path(self):
        command = self._capture(sast_scan.run_bandit)
        excludes = command[command.index("--exclude") + 1].split(",")
        self.assertIn("./ventures/v/dist", excludes)
        self.assertIn("./ventures/v/node_modules", excludes)
        self.assertNotIn("./ventures/v/src/app/api/build", excludes)


class WarningPartitionTests(unittest.TestCase):
    """Which `level: warn` errors may enter the declared unparsed set.

    The set is compared exactly, so anything that can enter or leave it without
    a file changing is a defect. Semgrep reports a timeout at the same level as
    a parse failure, and folding the two together made the register a function
    of machine load: measured on this repository, the default timeout produced 9
    `Timeout` warnings over 5 files that parse fine, and the set swung between
    52 and 57 on one unchanged tree.
    """

    def _run_with(self, errors):
        payload = {"results": [], "errors": errors, "paths": {"scanned": []}}

        class _Completed:
            returncode = 0
            stdout = json.dumps(payload)
            stderr = ""

        captured = {}

        def fake_run(command, **kwargs):
            captured["command"] = list(command)
            return _Completed()

        original_run = sast_scan.subprocess.run
        original_which = sast_scan.shutil.which
        sast_scan.subprocess.run = fake_run
        sast_scan.shutil.which = lambda name: f"/usr/bin/{name}"
        try:
            with tempfile.TemporaryDirectory() as root:
                _, unparsed = sast_scan.run_semgrep(Path(root))
            return unparsed, captured["command"]
        finally:
            sast_scan.subprocess.run = original_run
            sast_scan.shutil.which = original_which

    def test_the_per_file_timeout_is_disabled(self):
        """Without this, set membership is decided by wall-clock."""
        _, command = self._run_with([])
        self.assertIn("--timeout=0", command)

    def test_a_parse_failure_enters_the_set(self):
        unparsed, _ = self._run_with(
            [{"level": "warn", "type": ["PartialParsing", []], "path": "a.tsx"}]
        )
        self.assertEqual(unparsed, ["a.tsx"])

    def test_a_template_syntax_error_enters_the_set(self):
        """The Helm templates report this tag, and do so deterministically."""
        unparsed, _ = self._run_with(
            [{"level": "warn", "type": "Other syntax error", "path": "chart/x.yaml"}]
        )
        self.assertEqual(unparsed, ["chart/x.yaml"])

    def test_a_timeout_refuses_the_run_instead_of_joining_the_set(self):
        with self.assertRaises(ScanError) as caught:
            self._run_with(
                [
                    {"level": "warn", "type": ["PartialParsing", []], "path": "a.tsx"},
                    {"level": "warn", "type": "Timeout", "path": "big.tsx"},
                ]
            )
        message = str(caught.exception)
        self.assertIn("Timeout", message)
        self.assertIn("big.tsx", message)

    def test_an_unrecognised_tag_refuses_the_run(self):
        """An allowlist, so a new tag stops the gate rather than silently
        joining a register that is compared exactly."""
        with self.assertRaises(ScanError):
            self._run_with([{"level": "warn", "type": "SomeNewTag", "path": "a.tsx"}])

    def test_error_kind_unwraps_semgreps_list_form(self):
        """`type` is `["PartialParsing", [spans]]`; comparing the list to a
        string is never equal, which would classify every warning as unexpected."""
        self.assertEqual(
            sast_scan._error_kind({"type": ["PartialParsing", [{"path": "a"}]]}),
            "PartialParsing",
        )
        self.assertEqual(sast_scan._error_kind({"type": "Timeout"}), "Timeout")
        self.assertEqual(sast_scan._error_kind({"type": []}), "(empty)")
        self.assertEqual(sast_scan._error_kind("not a dict"), "(malformed)")


class RepositoryContractTests(unittest.TestCase):
    """Contract tests against the real register, so they run on every push."""

    @classmethod
    def setUpClass(cls):
        cls.document = yaml.safe_load(BASELINE_PATH.read_text(encoding="utf-8"))
        cls.entries = cls.document["baseline"]

    def test_real_baseline_is_valid_and_unexpired_today(self):
        self.assertEqual(validate_entries(self.entries, date.today()), [])

    def test_real_baseline_declares_a_parse_ceiling(self):
        self.assertIsInstance(self.document["coverage"]["semgrep_unparsed_max"], int)

    def test_real_baseline_declares_the_unparsed_set(self):
        """The register must name the files, not just bound how many there are.

        `check_parse_coverage` requires `coverage.semgrep_unparsed` and returns
        that single problem when it is absent, so a register without it fails
        the gate on every run regardless of what semgrep observed. That is
        exactly what shipped: the commit that moved this check from an exact
        count to a set comparison changed `sast_scan.py` and this file's
        synthetic fixtures, and never touched the real register — leaving the
        gate unconditionally red and parse coverage enforced by nothing.

        The test that existed asserted only `semgrep_unparsed_max`, the key the
        migration made vestigial, so nothing here noticed. A contract test over
        the real document is the thing that would have caught it, and it is
        cheap: it reads YAML and runs no scanner.
        """
        declared = self.document["coverage"].get("semgrep_unparsed")
        self.assertIsInstance(
            declared,
            list,
            "platform/sast-baseline.yaml must declare `coverage.semgrep_unparsed` "
            "as a list; without it `check_parse_coverage` fails closed on every run.",
        )
        self.assertTrue(all(isinstance(path, str) for path in declared))
        self.assertEqual(
            sorted(declared), declared, "keep the declared set sorted so diffs are readable"
        )
        self.assertEqual(
            len(set(declared)), len(declared), "the declared set contains a duplicate path"
        )

    def test_every_unparsed_path_still_exists(self):
        """A declared unparsed file that was deleted or renamed can never be
        observed again, so it sits in the register giving back nothing and is
        never reviewed — the same failure `test_every_waived_path_still_exists`
        covers for waivers."""
        declared = self.document["coverage"].get("semgrep_unparsed") or []
        missing = [path for path in declared if not (REPO_ROOT / path).exists()]
        self.assertEqual(
            missing, [], f"`coverage.semgrep_unparsed` names missing files: {missing}"
        )

    def test_declared_unparsed_set_is_within_its_own_ceiling(self):
        """The ceiling bounds the register, so the register cannot silently
        outgrow the number `cap_ratchet` and review are watching."""
        coverage = self.document["coverage"]
        declared = coverage.get("semgrep_unparsed") or []
        marginal = coverage.get("semgrep_unparsed_marginal") or []
        self.assertLessEqual(
            len(declared) + len(marginal),
            coverage["semgrep_unparsed_max"],
            "the declared unparsed set is over its own ceiling",
        )

    def test_docs_sast_states_the_real_size_of_the_unparsed_set(self):
        """`docs/SAST.md`'s "N files are only partially parsed" must be N.

        That sentence is the only place a reader learns how much of this
        repository SAST does not fully cover, and until now nothing checked it
        against the register it describes. `docs/SAST.md` says so itself, about
        the neighbouring prose: "Nothing checks prose in this file against the
        register." A number in a document that drifts from the number in the
        register is the shape this repository has already been bitten by —
        a required-but-unread field going quietly false while every count stays
        green — so the load-bearing sentence is bound to the register here.

        Deliberately the size and not the whole list: the list is in the
        register, one path per line, and duplicating it in prose would be a
        second copy to drift. The size is the claim a reader acts on.
        """
        declared = self.document["coverage"].get("semgrep_unparsed") or []
        source = (REPO_ROOT / "docs" / "SAST.md").read_text(encoding="utf-8")
        stated = re.findall(r"\*\*(\d+) files are only partially parsed\.\*\*", source)
        self.assertEqual(
            len(stated),
            1,
            "docs/SAST.md must carry exactly one `**N files are only partially "
            "parsed.**` sentence for this contract to bind; found "
            f"{len(stated)}. If the wording changes, change this test with it "
            "rather than letting the claim go unchecked.",
        )
        self.assertEqual(
            int(stated[0]),
            len(declared),
            f"docs/SAST.md says {stated[0]} files are only partially parsed, but "
            f"`coverage.semgrep_unparsed` declares {len(declared)}. The register "
            "is the measurement; update the sentence to match it.",
        )

    def test_every_waived_path_still_exists(self):
        """A waiver pointing at a deleted file can never be matched, so it can
        never go stale, so it never gets reviewed again."""
        missing = [e["path"] for e in self.entries if not (REPO_ROOT / e["path"]).exists()]
        self.assertEqual(missing, [], f"baseline entries point at missing files: {missing}")

    def test_every_reviewed_reason_is_substantive(self):
        """"False positive" on its own is not a reason anyone can re-review."""
        thin = [
            e["id"]
            for e in self.entries
            if e.get("status") == "reviewed" and len(str(e.get("reason", "")).split()) < 25
        ]
        self.assertEqual(thin, [], f"reviewed entries with a too-short reason: {thin}")

    def test_every_inherited_entry_carries_a_plan(self):
        planless = [
            e["id"]
            for e in self.entries
            if e.get("status") == "inherited" and not str(e.get("plan", "")).strip()
        ]
        self.assertEqual(planless, [], f"inherited entries with no plan: {planless}")

    def test_inherited_entries_expire_sooner_than_reviewed_ones(self):
        """Untriaged debt should come back for review before a cleared finding does."""
        inherited = [e for e in self.entries if e.get("status") == "inherited"]
        reviewed = [e for e in self.entries if e.get("status") == "reviewed"]
        if inherited and reviewed:
            self.assertLess(
                max(_as_date(e["expires"]) for e in inherited),
                min(_as_date(e["expires"]) for e in reviewed),
            )


if __name__ == "__main__":
    unittest.main()
