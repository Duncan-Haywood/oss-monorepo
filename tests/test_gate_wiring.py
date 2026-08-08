#!/usr/bin/env python3
"""Contract for `scripts/ci/gate_wiring.py`.

Two halves, and the second is the one that matters.

The first is ordinary: the detectors do what they claim, and they still fail on
inputs known to be holes. Those cases are lifted from the tree — a workflow
`paths:` entry that names a control and never runs it, a runner comment that
names a control and never runs it — because both are real shapes in this
repository and both would satisfy a substring search.

The second re-derives every registration in `REGISTERED_UNWIRED` from source
rather than reading its `why`. That is deliberate and it is the whole point. A
register whose entries are prose goes false silently: the sentence stays, the
fact under it changes, and every count stays green. So `gated_by` is checked by
opening the named test and confirming it reaches this repository, `imported_by`
is checked by opening each importer and confirming the import is still there and
that the importer itself still executes, and `pytest` is checked to still be a
registered gate in `scripts/test-ci.sh` — because if it stops being one, four
registrations become false statements at the same instant.

The audit is run against the real repository here as well as from
`scripts/test-ci.sh`. Both, not either: the named gate is the one a reader sees
in the PASSED list, and this is the one that runs when someone types `pytest`.
"""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import gate_wiring
from gate_wiring import (
    LIBRARY,
    MAX_REGISTRATION_DAYS,
    MAX_UNWIRED_CONTROLS,
    PYTEST_GATED,
    REGISTERED_UNWIRED,
    REGISTRATION_KINDS,
    Registration,
    WiringError,
    control_paths,
    declares_main,
    executing_controls,
    find_invocations,
    imports_module,
    invocations_in,
    measure,
    pytest_is_registered,
    runner_sources,
    strip_comment,
)


class RealRepositoryTests(unittest.TestCase):
    """The gate. Everything else in this file protects this method."""

    def test_every_control_in_scripts_ci_is_wired_or_registered(self):
        measurement = measure(REPO_ROOT)
        self.assertEqual(
            [f"[{finding.check}] {finding.message}" for finding in measurement.findings],
            [],
            "gate-wiring findings against this repository:\n"
            + gate_wiring.format_report(measurement),
        )

    def test_the_enumeration_is_not_empty(self):
        # A vacuous enumeration passes every assertion above it. `node --test`
        # over a glob that matches nothing exits 0, and this repository has
        # shipped that exact gate; the Python equivalent is refused here.
        controls = control_paths(REPO_ROOT)
        self.assertGreaterEqual(
            len(controls), 10, f"only {len(controls)} controls enumerated; the audit lost its subject"
        )
        self.assertIn("scripts/ci/cap_ratchet.py", controls)

    def test_the_audit_reads_runners_and_workflows_and_finds_both(self):
        sources = runner_sources(REPO_ROOT)
        self.assertIn("scripts/test-ci.sh", sources)
        self.assertTrue(
            any(source.startswith(".gitea/workflows/") for source in sources),
            "no workflow was searched, so a workflow-only control would read as unwired",
        )
        by_source = {invocation.source for invocation in find_invocations(REPO_ROOT)}
        self.assertIn(
            "scripts/test-ci.sh", by_source, "no invocation found in the runner that holds twelve"
        )
        self.assertTrue(
            any(source.startswith(".gitea/workflows/") for source in by_source),
            "no invocation found in any workflow; `sast_scan.py` is invoked from security.yml, "
            "so finding none means the workflow half of the detector has stopped working",
        )

    def test_this_audit_is_itself_wired(self):
        """The trap this control exists to catch, applied to the control.

        A correct gate that runs on no path is the defect. If this file's own
        invocation is dropped from `scripts/test-ci.sh`, the audit stops running
        and its last recorded result stays green forever.
        """
        measurement = measure(REPO_ROOT)
        self.assertIn(
            "scripts/ci/gate_wiring.py",
            measurement.wired,
            "the wiring audit is not invoked by any runner",
        )

    def test_the_cli_exits_non_zero_when_it_has_findings(self):
        """A gate that cannot fail is not a gate.

        Run as a subprocess against a scratch tree holding one unregistered
        control, because the exit code is what `run_ci_test` reads and an
        in-process `main()` cannot prove the process status.
        """
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "scripts" / "ci").mkdir(parents=True)
            (root / ".gitea" / "workflows").mkdir(parents=True)
            (root / "scripts" / "ci" / "orphan.py").write_text("print('hi')\n", encoding="utf-8")
            (root / "scripts" / "test-ci.sh").write_text("echo nothing\n", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(CI_DIR / "gate_wiring.py"), "--repo-root", str(root)],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("orphan.py", result.stdout)

    def test_a_refusal_is_not_a_pass(self):
        # "I could not look" must never render as "nothing is unwired".
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            result = subprocess.run(
                [sys.executable, str(CI_DIR / "gate_wiring.py"), "--repo-root", raw],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)


class DetectorTests(unittest.TestCase):
    """Each case is a shape that exists in this tree, or is one edit away."""

    def test_a_workflow_paths_filter_is_not_an_invocation(self):
        # The live false positive: `.gitea/workflows/deploy-services.yml` names
        # `scripts/ci/terraform_images.py` in two `paths:` lists and runs it
        # never. Counting that as wiring would excuse a control that has never
        # executed, which is the failure this audit exists to find.
        text = "\n".join(
            [
                "on:",
                "  pull_request:",
                "    paths:",
                '      - "scripts/ci/terraform_images.py"',
            ]
        )
        self.assertEqual(invocations_in(text, "terraform_images.py", "w.yml", "c"), [])

    def test_a_workflow_run_step_is_an_invocation(self):
        text = "        run: python3 scripts/ci/sast_scan.py --report sast-report.md"
        found = invocations_in(text, "sast_scan.py", "w.yml", "c")
        self.assertEqual(len(found), 1)

    def test_a_comment_naming_a_control_is_not_an_invocation(self):
        # `scripts/test-ci.sh` carries a paragraph of prose above every gate,
        # and several of those paragraphs name controls that are wired
        # elsewhere or not at all. Line 198 names `release_lag.py` in a comment
        # and there is no `run_ci_test` for it anywhere.
        text = "\n".join(
            [
                "# `scripts/ci/release_lag.py` says how much work has not shipped.",
                "#   python3 scripts/ci/release_lag.py --json",
                "  # python3 scripts/ci/release_lag.py",
            ]
        )
        self.assertEqual(invocations_in(text, "release_lag.py", "scripts/test-ci.sh", "c"), [])

    def test_a_trailing_comment_does_not_hide_a_real_invocation(self):
        text = 'run_ci_test "X" python3 "${REPO_ROOT}/scripts/ci/cap_ratchet.py"  # the ratchet'
        self.assertEqual(len(invocations_in(text, "cap_ratchet.py", "s.sh", "c")), 1)

    def test_a_hash_inside_quotes_does_not_truncate_the_line(self):
        self.assertEqual(strip_comment('echo "a # b" && python3 x.py'), 'echo "a # b" && python3 x.py')

    def test_strip_comment_keeps_a_hash_that_is_not_a_comment_marker(self):
        self.assertEqual(strip_comment("run --tag=v1#2 x"), "run --tag=v1#2 x")
        self.assertEqual(strip_comment("run x # note"), "run x ")
        self.assertEqual(strip_comment("# whole line"), "")

    def test_a_bare_mention_without_an_interpreter_is_not_an_invocation(self):
        text = "\n".join(
            [
                "SCRIPTS=scripts/ci/image_tags.py",
                "echo scripts/ci/image_tags.py",
            ]
        )
        self.assertEqual(invocations_in(text, "image_tags.py", "s.sh", "c"), [])

    def test_a_longer_filename_is_not_matched_by_a_shorter_one(self):
        # `image_tags.py` must not be found inside `image_tags_extra.py`.
        text = "python3 scripts/ci/image_tags_extra.py"
        self.assertEqual(invocations_in(text, "image_tags.py", "s.sh", "c"), [])

    def test_the_detector_reports_the_line_it_found(self):
        text = "\n".join(["# nothing", "python3 scripts/ci/x.py", "# nothing"])
        found = invocations_in(text, "x.py", "s.sh", "scripts/ci/x.py")
        self.assertEqual([f.line for f in found], [2])
        self.assertEqual(found[0].source, "s.sh")

    def test_declares_main_distinguishes_a_gate_from_a_library(self):
        self.assertTrue(declares_main(REPO_ROOT, "scripts/ci/cap_ratchet.py"))
        self.assertFalse(declares_main(REPO_ROOT, "scripts/ci/baseline_trust.py"))

    def test_imports_module_reads_both_spellings_and_refuses_a_substring(self):
        self.assertTrue(
            imports_module(REPO_ROOT, "scripts/ci/release_lag.py", "scripts/ci/baseline_trust.py")
        )
        self.assertFalse(
            imports_module(REPO_ROOT, "scripts/ci/cap_ratchet.py", "scripts/ci/baseline_trust.py")
        )


class RegisterContractTests(unittest.TestCase):
    """Every registered reason, recomputed from the tree instead of read."""

    def test_pytest_is_still_a_registered_gate(self):
        # The single fact under every `pytest-gated` entry. If it goes, they all
        # become false at once and nothing else here would notice.
        self.assertTrue(
            pytest_is_registered(REPO_ROOT),
            "`scripts/test-ci.sh` no longer registers pytest as a named gate, so the "
            "execution path every pytest-gated registration rests on is gone",
        )

    def test_every_pytest_gated_entry_reaches_this_repository(self):
        """A fixture-only contract is a proof, not a gate.

        `tests/test_audit_killed_ventures.py` ran five cases against `tmp_path`
        skeletons and never once asked the control about this tree. It read as
        coverage from outside for its whole life. So an entry claiming a pytest
        contract has to name a test that reaches `REPO_ROOT`.
        """
        for registration in REGISTERED_UNWIRED:
            if registration.kind != PYTEST_GATED:
                continue
            with self.subTest(control=registration.path):
                self.assertIsNotNone(registration.gated_by)
                test_path = REPO_ROOT / registration.gated_by
                self.assertTrue(test_path.is_file(), f"{registration.gated_by} does not exist")
                source = test_path.read_text(encoding="utf-8")
                basename = registration.path.rsplit("/", 1)[-1]
                self.assertIn(
                    basename,
                    source,
                    f"{registration.gated_by} does not exercise {basename}",
                )
                self.assertIn(
                    "REPO_ROOT",
                    source,
                    f"{registration.gated_by} never names REPO_ROOT, so it exercises "
                    f"{registration.path} against fixtures alone",
                )

    def test_every_library_entry_has_no_entrypoint_and_a_live_importer(self):
        wired = measure(REPO_ROOT).wired
        executing = executing_controls(wired)
        for registration in REGISTERED_UNWIRED:
            if registration.kind != LIBRARY:
                continue
            with self.subTest(control=registration.path):
                self.assertFalse(
                    declares_main(REPO_ROOT, registration.path),
                    f"{registration.path} is excused as a library and declares a "
                    "`__main__` block, so it is a gate with no invocation",
                )
                self.assertTrue(registration.imported_by, "a library entry names its importers")
                for importer in registration.imported_by:
                    self.assertTrue(
                        imports_module(REPO_ROOT, importer, registration.path),
                        f"{importer} no longer imports {registration.path}",
                    )
                    self.assertIn(
                        importer,
                        executing,
                        f"{registration.path} is excused because {importer} runs it, and "
                        f"{importer} does not itself execute",
                    )

    def test_every_baseline_measuring_gate_verifies_its_baseline(self):
        """Enrollment, derived — not a list someone remembered to extend.

        `baseline_trust.py` exists because `refs/remotes/origin/main` is a local
        file any process may write, and four hand-written entries are on this
        repository's reflog. Until 2026-08-08 the obligation to consult it was
        recorded only as the `imported_by` tuple on that module's registration,
        which names the controls that *do* import it. A gate that measured against
        `origin/main` and skipped verification was therefore simply absent from
        the list, and nothing was in a position to notice.

        One was. `integration_debt.py` counted every tip against `origin/main`
        with no check at all, and a single `git update-ref` pointing that ref at a
        local merge of the pile took its measurement from 2 tips to 0 — landing in
        the branch whose message asks the reader to lower the ceiling to the
        forged number. See `tests/test_integration_debt.py::BaselineTrustTest`.

        So the rule is computed from source here. A module under `scripts/ci/`
        that declares an entrypoint and names a baseline — the literal
        `"origin/main"` in code, or the `baseline_ref` identifier — must import
        `baseline_trust`. `ast` is used rather than a text search so that prose
        about `origin/main` in a docstring, of which there is a great deal in this
        repository, cannot satisfy or trip the rule.
        """
        import ast

        obliged = []
        for path in sorted(CI_DIR.glob("*.py")):
            control = f"scripts/ci/{path.name}"
            if not declares_main(REPO_ROOT, control):
                continue
            tree = ast.parse(path.read_text())
            names_a_baseline = any(
                (isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value == "origin/main")
                or (isinstance(n, ast.Name) and n.id == "baseline_ref")
                or (isinstance(n, ast.arg) and n.arg == "baseline_ref")
                for n in ast.walk(tree)
            )
            if names_a_baseline:
                obliged.append(control)

        # If this drops to nothing the rule has stopped selecting anything and the
        # test would pass vacuously — the shape `docs/CONTROL-AUDIT-2026-08-04.md`
        # records as a vacuous glob, in a different language.
        self.assertGreaterEqual(
            len(obliged),
            4,
            f"the baseline-gate detector selected {obliged}; it is no longer finding the "
            "controls it exists to police",
        )

        for control in obliged:
            with self.subTest(control=control):
                self.assertTrue(
                    imports_module(REPO_ROOT, control, "scripts/ci/baseline_trust.py"),
                    f"{control} measures against a baseline ref and does not import "
                    "scripts/ci/baseline_trust.py, so it counts against a local file "
                    "nobody checked against the remote",
                )

    def test_no_control_is_both_wired_and_registered(self):
        wired = set(measure(REPO_ROOT).wired)
        both = sorted(r.path for r in REGISTERED_UNWIRED if r.path in wired)
        self.assertEqual(
            both,
            [],
            "registered as unwired while a runner invokes it — delete the entry: "
            + ", ".join(both),
        )

    def test_every_entry_names_one_real_control(self):
        # An entry that outlives its subject sits in the register forever, ready
        # to absorb a file of the same name added back later without review.
        for registration in REGISTERED_UNWIRED:
            with self.subTest(control=registration.path):
                self.assertTrue(
                    (REPO_ROOT / registration.path).is_file(),
                    f"{registration.path} is registered and does not exist",
                )
                self.assertTrue(registration.path.startswith("scripts/ci/"))
                self.assertTrue(registration.path.endswith(".py"))
                self.assertNotIn("*", registration.path)

    def test_no_entry_is_declared_twice(self):
        paths = [r.path for r in REGISTERED_UNWIRED]
        self.assertEqual(len(paths), len(set(paths)), "a control is registered twice")

    def test_every_entry_carries_owner_issue_expiry_and_an_argument(self):
        today = date.today()
        for registration in REGISTERED_UNWIRED:
            with self.subTest(control=registration.path):
                self.assertIn(registration.kind, REGISTRATION_KINDS)
                self.assertTrue(registration.owner.strip(), "an entry has an owner")
                self.assertTrue(registration.issue.strip(), "an entry has an issue")
                self.assertRegex(registration.expires, r"^\d{4}-\d{2}-\d{2}$")
                expiry = date.fromisoformat(registration.expires)
                self.assertGreaterEqual(
                    expiry, today, f"{registration.path} expired on {registration.expires}"
                )
                self.assertLessEqual(
                    expiry,
                    today + timedelta(days=MAX_REGISTRATION_DAYS),
                    f"{registration.path} is parked more than {MAX_REGISTRATION_DAYS} days out",
                )
                self.assertGreater(
                    len(registration.why), 80, "the reason has to be an argument, not a label"
                )

    def test_the_register_is_capped_below_the_directory(self):
        live = [r for r in REGISTERED_UNWIRED if (REPO_ROOT / r.path).is_file()]
        self.assertLessEqual(len(live), MAX_UNWIRED_CONTROLS)
        self.assertLess(
            MAX_UNWIRED_CONTROLS,
            len(control_paths(REPO_ROOT)),
            "a ceiling that can cover every control is not a ceiling",
        )


class RegisterDetectorTests(unittest.TestCase):
    """The register checks still refuse the register entries that are wrong."""

    def _findings(self, registration: Registration, wired=()):
        return [
            finding.check
            for finding in gate_wiring.registration_findings(
                REPO_ROOT, registration, wired, date.today()
            )
        ]

    def test_a_fixture_only_pytest_gate_is_refused(self):
        # The `audit_killed_ventures.py` shape, reconstructed: a test that
        # exercises the control and never names REPO_ROOT.
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            fake = Path(raw) / "test_fixture_only.py"
            fake.write_text("from cap_ratchet import main\nmain(['--repo-root', str(tmp)])\n")
            registration = Registration(
                path="scripts/ci/cap_ratchet.py",
                kind=PYTEST_GATED,
                owner="duncan",
                issue="x",
                expires=(date.today() + timedelta(days=30)).isoformat(),
                gated_by=str(fake.relative_to(REPO_ROOT))
                if str(fake).startswith(str(REPO_ROOT))
                else "tests/does_not_exist.py",
                why="y" * 100,
            )
            checks = self._findings(registration)
        self.assertTrue(
            {"fixture-only-gate", "registration-stale"} & set(checks),
            f"a fixture-only gate was accepted: {checks}",
        )

    def test_a_library_entry_with_an_entrypoint_is_refused(self):
        registration = Registration(
            path="scripts/ci/cap_ratchet.py",
            kind=LIBRARY,
            owner="duncan",
            issue="x",
            expires=(date.today() + timedelta(days=30)).isoformat(),
            imported_by=("scripts/ci/release_lag.py",),
            why="y" * 100,
        )
        self.assertIn("library-has-entrypoint", self._findings(registration))

    def test_a_library_entry_naming_a_non_importer_is_refused(self):
        registration = Registration(
            path="scripts/ci/baseline_trust.py",
            kind=LIBRARY,
            owner="duncan",
            issue="x",
            expires=(date.today() + timedelta(days=30)).isoformat(),
            imported_by=("scripts/ci/tracked_symlinks.py",),
            why="y" * 100,
        )
        self.assertIn("registration-stale", self._findings(registration))

    def test_an_expired_entry_is_refused(self):
        registration = Registration(
            path="scripts/ci/baseline_trust.py",
            kind=LIBRARY,
            owner="duncan",
            issue="x",
            expires=(date.today() - timedelta(days=1)).isoformat(),
            imported_by=("scripts/ci/release_lag.py",),
            why="y" * 100,
        )
        self.assertIn("registration-expired", self._findings(registration))

    def test_an_entry_parked_beyond_the_review_horizon_is_refused(self):
        registration = Registration(
            path="scripts/ci/baseline_trust.py",
            kind=LIBRARY,
            owner="duncan",
            issue="x",
            expires=(date.today() + timedelta(days=MAX_REGISTRATION_DAYS + 30)).isoformat(),
            imported_by=("scripts/ci/release_lag.py",),
            why="y" * 100,
        )
        self.assertIn("registration-unreviewed", self._findings(registration))

    def test_an_entry_for_a_deleted_control_is_refused(self):
        registration = Registration(
            path="scripts/ci/gone_forever.py",
            kind=LIBRARY,
            owner="duncan",
            issue="x",
            expires=(date.today() + timedelta(days=30)).isoformat(),
            imported_by=("scripts/ci/release_lag.py",),
            why="y" * 100,
        )
        self.assertIn("registration-stale", self._findings(registration))

    def test_an_entry_beside_a_live_invocation_is_refused(self):
        registration = Registration(
            path="scripts/ci/cap_ratchet.py",
            kind=PYTEST_GATED,
            owner="duncan",
            issue="x",
            expires=(date.today() + timedelta(days=30)).isoformat(),
            gated_by="tests/test_cap_ratchet.py",
            why="y" * 100,
        )
        self.assertIn(
            "registration-redundant", self._findings(registration, wired=("scripts/ci/cap_ratchet.py",))
        )

    def test_an_unknown_kind_carries_no_predicate_and_is_refused(self):
        registration = Registration(
            path="scripts/ci/baseline_trust.py",
            kind="because-i-said-so",
            owner="duncan",
            issue="x",
            expires=(date.today() + timedelta(days=30)).isoformat(),
            why="y" * 100,
        )
        self.assertIn("registration-incomplete", self._findings(registration))


class SupersededControlTests(unittest.TestCase):
    """`audit_killed_ventures.py` is gone, and must not come back unnoticed."""

    def test_the_wrong_engine_control_is_not_present(self):
        self.assertFalse(
            (REPO_ROOT / "scripts/ci/audit_killed_ventures.py").exists(),
            "audit_killed_ventures.py is back. It read `portfolio/router/allocate.py` at "
            "$500 while the engine `scripts/test-ci.sh` runs is `portfolio/router/router.py` "
            "at $300, and it instructed owners to record overrides under "
            "`kill_criteria_overrides`, a key nothing but `allocate.py` reads. "
            "`scripts/ci/stopping_rule_review.py` does the job against the authoritative "
            "engine. If it is genuinely wanted back, it must be wired and must read "
            "`portfolio/router/kill_criteria.py`.",
        )

    def test_no_control_reads_the_orphaned_allocation_engine(self):
        """The engine check, stated over the directory rather than one file.

        `router.py` is what `scripts/test-ci.sh` runs and what writes
        `portfolio/ALLOCATION_REPORT.md`. `allocate.py` is run by nothing. A
        control that measures the portfolio against the engine nobody runs
        reports on a budget that is not being spent.
        """
        offenders = []
        for control in control_paths(REPO_ROOT):
            source = (REPO_ROOT / control).read_text(encoding="utf-8")
            for match in re.finditer(
                r"^\s*(?:from|import)\s+[\w.]*\ballocate\b", source, re.MULTILINE
            ):
                offenders.append(f"{control}:{source[: match.start()].count(chr(10)) + 1}")
        self.assertEqual(
            offenders,
            [],
            "these controls import the orphaned $500 allocation engine instead of "
            "`portfolio/router/router.py` / `portfolio/router/kill_criteria.py`: "
            + ", ".join(offenders),
        )


class RefusalTests(unittest.TestCase):
    def test_a_missing_control_directory_refuses_rather_than_passing(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaises(WiringError):
                measure(Path(raw))

    def test_an_empty_control_directory_refuses_rather_than_passing(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "scripts" / "ci").mkdir(parents=True)
            (root / "scripts" / "test-ci.sh").write_text("echo\n", encoding="utf-8")
            with self.assertRaises(WiringError):
                measure(root)

    def test_no_runners_refuses_rather_than_reporting_everything_unwired(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "scripts" / "ci").mkdir(parents=True)
            (root / "scripts" / "ci" / "thing.py").write_text("x = 1\n", encoding="utf-8")
            with self.assertRaises(WiringError):
                measure(root)


if __name__ == "__main__":
    unittest.main()
