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
import sys
import tempfile
import unittest
from datetime import date, timedelta
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
