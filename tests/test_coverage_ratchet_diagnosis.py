#!/usr/bin/env python3
"""
Tests for what the coverage ratchet *says* when a component cannot be measured.

Separate from `test_coverage_ratchet.py`, which covers whether the gate passes
or fails. These cover the diagnosis it prints, which is a different property and
was wrong in a way the pass/fail tests could not see: both states below fail
closed, correctly, and the gate looked healthy while telling the reader to go
fix a test suite that was never broken.

Observed 2026-08-01. `ventures/print-atelier` passes 235/235 with its
dependencies installed. Measured in a fresh git worktree, which by design has no
`node_modules`, the same component was reported as:

    ERROR [coverage-command-failed] print-atelier: coverage command exited 1:
        -> A failing suite has no meaningful coverage. Fix the suite first.

Three separate defects produced that line, and the messages were empty for the
third one:

1. The audit had no notion of an uninstalled component, so death during module
   resolution was indistinguishable from a real test failure.
2. The excerpt took the last eight lines of output, which for any Node stack
   trace are all `at ...` frames, so an `Error: ...` line scrolls off.
3. The reason never reached the excerpt at all. `--test-reporter-destination`
   redirects *everything*, including the error that killed the run, into the
   lcov file. Measured on print-atelier: exit 1, zero bytes on both stdout and
   stderr, and a 4-byte lcov containing `TN:`. Nothing followed the colon
   because there was nothing to print.

Fixing only 1 and 2 would have left the real message empty, and fixing 1 by the
manifest alone would have mislabelled `platform/ci` — which needs no install —
and hidden the genuine catalog failure its suite was catching. Both wrong turns
are pinned by tests below.

No test here is skipped or conditionally skipped, per the note in
`test_coverage_ratchet.py`.
"""

import json
import os
import subprocess
import sys
import unittest.mock
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import coverage_ratchet
from coverage_ratchet import (
    declares_uninstalled_dependencies,
    failure_excerpt,
    looks_like_unresolved_import,
    run_coverage,
    uncommitted_component_paths,
    unresolved_import_line,
    without_reporter_arguments,
)


def write_manifest(directory: Path, manifest: dict) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "package.json").write_text(json.dumps(manifest))


SAFE_GIT_ENV = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "XDG_CONFIG_HOME": "/dev/null"}


def init_repo(repo_root: Path) -> None:
    """A real git repository with one commit, so `git status` has a HEAD."""
    repo_root.mkdir(parents=True, exist_ok=True)
    env_args = [
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "user.name=Coverage Ratchet Test",
    ]
    subprocess.run(["git", "-C", str(repo_root), "init", "-q"], check=True, env=SAFE_GIT_ENV)
    (repo_root / ".gitkeep").write_text("")
    subprocess.run(["git", "-C", str(repo_root), "add", "-A"], check=True, env=SAFE_GIT_ENV)
    subprocess.run(
        ["git", "-C", str(repo_root), *env_args, "commit", "-qm", "base"], check=True, env=SAFE_GIT_ENV
    )


def commit_all(repo_root: Path) -> None:
    subprocess.run(["git", "-C", str(repo_root), "add", "-A"], check=True, env=SAFE_GIT_ENV)
    subprocess.run(
        [
            "git",
            "-C",
            str(repo_root),
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "user.name=Coverage Ratchet Test",
            "commit",
            "-qm",
            "component",
        ],
        check=True,
        env=SAFE_GIT_ENV,
    )


class UninstalledDependencyDetectionTest(unittest.TestCase):
    """`declares_uninstalled_dependencies` in isolation."""

    def test_declared_dependencies_without_node_modules_are_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            component = Path(tmp) / "venture"
            write_manifest(component, {"dependencies": {"tsx": "^4.0.0"}})
            self.assertTrue(declares_uninstalled_dependencies(component))

    def test_dev_dependencies_alone_still_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            component = Path(tmp) / "venture"
            write_manifest(component, {"devDependencies": {"tsx": "^4.0.0"}})
            self.assertTrue(declares_uninstalled_dependencies(component))

    def test_installed_component_is_not_flagged(self):
        with tempfile.TemporaryDirectory() as tmp:
            component = Path(tmp) / "venture"
            write_manifest(component, {"dependencies": {"tsx": "^4.0.0"}})
            (component / "node_modules").mkdir()
            self.assertFalse(declares_uninstalled_dependencies(component))

    def test_component_declaring_no_dependencies_is_not_flagged(self):
        """`platform/ci` runs on the Node standard library and installs nothing.

        Flagging it would turn a healthy component red, which is how a
        well-meant diagnosis becomes a false failure.
        """
        with tempfile.TemporaryDirectory() as tmp:
            component = Path(tmp) / "venture"
            write_manifest(component, {"scripts": {"test": "node --test"}})
            self.assertFalse(declares_uninstalled_dependencies(component))

    def test_component_without_a_manifest_is_not_flagged(self):
        with tempfile.TemporaryDirectory() as tmp:
            component = Path(tmp) / "venture"
            component.mkdir(parents=True)
            self.assertFalse(declares_uninstalled_dependencies(component))

    def test_unreadable_manifest_is_left_to_the_command_to_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            component = Path(tmp) / "venture"
            component.mkdir(parents=True)
            (component / "package.json").write_text("{not json")
            self.assertFalse(declares_uninstalled_dependencies(component))


class FailureExcerptTest(unittest.TestCase):
    """The excerpt must keep the line that names the cause."""

    NODE_MODULE_NOT_FOUND = """
node:internal/modules/package_json_reader:301
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from /repo/ventures/print-atelier/
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
    at packageResolve (node:internal/modules/esm/resolve:784:25)
    at moduleResolve (node:internal/modules/esm/resolve:873:18)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:704:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:724:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:762:56)
    at ModuleLoader.importSync (node:internal/modules/esm/loader:344:30)
"""

    def test_stack_frames_do_not_crowd_out_the_error(self):
        excerpt = failure_excerpt(self.NODE_MODULE_NOT_FOUND)
        self.assertTrue(
            any("Cannot find package 'tsx'" in line for line in excerpt),
            f"the excerpt lost the only line naming the cause: {excerpt}",
        )

    def test_the_old_tail_heuristic_would_have_lost_it(self):
        """Pins the regression this replaced, so a revert to `[-8:]` fails here."""
        naive = self.NODE_MODULE_NOT_FOUND.strip().splitlines()[-8:]
        self.assertFalse(
            any("Cannot find package 'tsx'" in line for line in naive),
            "fixture no longer reproduces the defect it was written for",
        )

    def test_frames_are_kept_when_they_are_all_there_is(self):
        excerpt = failure_excerpt("    at only (frames.js:1:1)\n    at more (frames.js:2:2)")
        self.assertEqual(len(excerpt), 2)

    def test_excerpt_respects_its_limit(self):
        excerpt = failure_excerpt("\n".join(f"line {n}" for n in range(50)))
        self.assertEqual(len(excerpt), 8)

    def test_empty_output_yields_no_excerpt(self):
        self.assertEqual(failure_excerpt("   \n  \n"), [])


class UnresolvedImportDetectionTest(unittest.TestCase):
    """The second half of the evidence: how the command actually died."""

    def test_node_esm_resolution_failure_is_recognised(self):
        self.assertTrue(
            looks_like_unresolved_import(
                "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx'"
            )
        )

    def test_commonjs_resolution_failure_is_recognised(self):
        self.assertTrue(
            looks_like_unresolved_import("Error: Cannot find module 'tsx'")
        )

    def test_an_ordinary_assertion_failure_is_not(self):
        self.assertFalse(
            looks_like_unresolved_import(
                "AssertionError [ERR_ASSERTION]: expected true to equal false"
            )
        )


class UnresolvedImportLineTest(unittest.TestCase):
    """Which line gets quoted when a loader is missing."""

    NODE_OUTPUT = (
        "node:internal/modules/package_json_reader:301\n"
        "  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);\n"
        "        ^\n"
        "\n"
        "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from /repo/\n"
        "    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)\n"
    )

    def test_the_quoted_line_names_the_missing_package(self):
        line = unresolved_import_line(self.NODE_OUTPUT)
        self.assertIn("Cannot find package 'tsx'", line)

    def test_the_throw_statement_is_not_preferred(self):
        """It carries the code but names nothing, so it is the weaker match."""
        line = unresolved_import_line(self.NODE_OUTPUT)
        self.assertNotIn("throw new", line)

    def test_the_code_line_is_used_when_nothing_names_a_package(self):
        line = unresolved_import_line("  throw new ERR_MODULE_NOT_FOUND(x);")
        self.assertIn("ERR_MODULE_NOT_FOUND", line)

    def test_unrelated_output_yields_nothing(self):
        self.assertEqual(unresolved_import_line("AssertionError: nope"), "")


class ReporterArgumentStrippingTest(unittest.TestCase):
    """The reporter arguments are what swallow the diagnostic."""

    def test_both_reporter_arguments_are_removed(self):
        stripped = without_reporter_arguments(
            [
                "node",
                "--test",
                "--experimental-test-coverage",
                "--test-reporter=lcov",
                "--test-reporter-destination=/tmp/c.lcov",
                "tests/*.test.ts",
            ]
        )
        self.assertEqual(
            stripped,
            ["node", "--test", "--experimental-test-coverage", "tests/*.test.ts"],
        )

    def test_nothing_else_is_removed(self):
        command = ["node", "--import", "tsx", "--test", "tests/a.test.ts"]
        self.assertEqual(without_reporter_arguments(command), command)


class RunCoverageDiagnosisTest(unittest.TestCase):
    """The finding `run_coverage` returns, end to end, per failure cause."""

    def _entry(self, path: str, command: list) -> dict:
        return {"id": "component-under-test", "path": path, "command": command}

    def _component(self, repo_root: Path, manifest: dict) -> Path:
        component = repo_root / "ventures" / "subject"
        write_manifest(component, manifest)
        return component

    def test_uninstalled_component_fails_closed_naming_the_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            self._component(repo_root, {"devDependencies": {"tsx": "^4.0.0"}})

            measurement, finding = run_coverage(
                repo_root,
                # Genuinely unresolvable, so this exercises the real Node error
                # rather than a hand-written approximation of it.
                self._entry("ventures/subject", ["node", "--import", "tsx", "-e", ""]),
            )

            self.assertIsNone(measurement, "an uninstalled component measures nothing")
            self.assertIsNotNone(finding, "it must still fail closed, never skip")
            self.assertEqual(finding.severity, "error")
            self.assertEqual(finding.code, "component-dependencies-missing")
            self.assertIn("node_modules", finding.message)
            self.assertIn("npm ci", finding.remedy)
            self.assertNotIn("Fix the suite first", finding.remedy)

    def test_a_genuinely_failing_suite_is_still_blamed_on_the_suite(self):
        """A component with uninstalled deps whose command fails for its own reasons.

        The regression that made this file necessary in its current shape:
        keying the diagnosis on the manifest alone reported `platform/ci` — which
        tests on the Node standard library and needs no install — as
        uninstalled, hiding the real catalog failure its suite had just caught.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            self._component(repo_root, {"dependencies": {"@dagger.io/dagger": "^0.16.1"}})

            _, finding = run_coverage(
                repo_root,
                self._entry(
                    "ventures/subject",
                    ["node", "-e", "console.error('AssertionError: catalog drift'); process.exit(1)"],
                ),
            )

            self.assertEqual(finding.code, "coverage-command-failed")
            self.assertIn("catalog drift", finding.message)

    def test_an_installed_component_that_fails_blames_the_suite(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            component = self._component(repo_root, {"dependencies": {"tsx": "^4.0.0"}})
            (component / "node_modules").mkdir()

            _, finding = run_coverage(
                repo_root,
                self._entry(
                    "ventures/subject",
                    ["node", "-e", "console.error(\"Cannot find module 'x'\"); process.exit(1)"],
                ),
            )

            self.assertEqual(
                finding.code,
                "coverage-command-failed",
                "an installed component's resolution error is its own bug to fix",
            )

    def test_a_missing_path_still_reports_the_path_not_the_dependencies(self):
        """Ordering check: the path finding must win, or the cause is misnamed."""
        with tempfile.TemporaryDirectory() as tmp:
            _, finding = run_coverage(
                Path(tmp), self._entry("ventures/absent", ["node", "--test"])
            )
            self.assertEqual(finding.code, "missing-component-path")

    def test_a_reason_swallowed_by_the_reporter_is_recovered(self):
        """The defect that made every failure message empty.

        `--test-reporter-destination` redirects the error that killed the run
        into the lcov file, leaving empty stdout and stderr. Measured on
        print-atelier before this changed: exit 1, 0 bytes on both streams, and
        a 4-byte lcov — reported as `coverage command exited 1:` with nothing
        after the colon.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            component = self._component(repo_root, {"scripts": {"test": "node --test"}})
            (component / "node_modules").mkdir()

            # Writes its reason to the reporter destination and nowhere else,
            # exactly as node --test does when it dies during module loading.
            script = (
                "const fs=require('fs');"
                "const dest=process.argv.find(a=>a.startsWith('--test-reporter-destination='));"
                "if(dest){fs.writeFileSync(dest.split('=')[1],'TN:\\n');process.exit(1);}"
                "console.error('AssertionError: the real reason');process.exit(1);"
            )
            _, finding = run_coverage(
                repo_root,
                self._entry(
                    "ventures/subject",
                    [
                        "node",
                        "-e",
                        script,
                        "--test-reporter=lcov",
                        "--test-reporter-destination=$COVERAGE_LCOV_DESTINATION",
                    ],
                ),
            )

            self.assertEqual(finding.code, "coverage-command-failed")
            self.assertIn(
                "the real reason",
                finding.message,
                "the finding must carry a reason, not just an exit code",
            )


class UncommittedComponentPathsTest(unittest.TestCase):
    """What `git status` is asked, and what the answer is used for."""

    def test_a_clean_component_lists_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            write_manifest(repo_root / "ventures" / "subject", {})
            commit_all(repo_root)

            self.assertEqual(uncommitted_component_paths(repo_root, "ventures/subject"), [])

    def test_a_modified_tracked_file_is_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {})
            commit_all(repo_root)
            (component / "package.json").write_text(json.dumps({"name": "changed"}))

            self.assertEqual(
                uncommitted_component_paths(repo_root, "ventures/subject"),
                ["ventures/subject/package.json"],
            )

    def test_an_untracked_file_is_listed(self):
        """The case that actually happened.

        The print-atelier misdiagnosis on 2026-08-04 was caused by a brand new
        test file that existed for about ninety seconds — the red half of
        another session's red-green cycle. It was never tracked, so a check
        that only looked at modifications would have seen a clean tree and
        blamed the suite, which is the whole defect.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {})
            commit_all(repo_root)
            (component / "in-progress.test.ts").write_text("// half written\n")

            self.assertEqual(
                uncommitted_component_paths(repo_root, "ventures/subject"),
                ["ventures/subject/in-progress.test.ts"],
            )

    def test_changes_outside_the_component_are_not_listed(self):
        """Scoped to the component, or every run in a busy repository is 'dirty'.

        Twenty concurrent sessions means something in the tree is always
        uncommitted. An unscoped status would mark every component dirty and
        every coverage failure unattributable, so the scoping is the load-
        bearing half of the check rather than a tidiness.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            write_manifest(repo_root / "ventures" / "subject", {})
            write_manifest(repo_root / "ventures" / "elsewhere", {})
            commit_all(repo_root)
            # Content must actually differ. An earlier draft rewrote `{}` with
            # `{}`, so the tree was never dirty and this passed against an
            # unscoped `git status` — a fixture that asserted nothing.
            (repo_root / "ventures" / "elsewhere" / "package.json").write_text(
                json.dumps({"name": "changed-elsewhere"})
            )
            self.assertNotEqual(
                uncommitted_component_paths(repo_root, "ventures/elsewhere"),
                [],
                "precondition: the other component really is dirty",
            )

            self.assertEqual(uncommitted_component_paths(repo_root, "ventures/subject"), [])

    def test_the_list_is_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {})
            commit_all(repo_root)
            for index in range(12):
                (component / f"new-{index}.ts").write_text("//\n")

            listed = uncommitted_component_paths(repo_root, "ventures/subject", limit=6)
            self.assertEqual(len(listed), 6, "a finding is a sentence, not a status dump")

    def test_outside_a_repository_it_says_nothing_rather_than_raising(self):
        """The deliberate soft failure, pinned.

        Everywhere else in this file a missing input is an error, because the
        gate would otherwise pass work it never checked. Here the gate has
        already failed and this call only words the finding, so an unusable git
        must degrade to the generic diagnosis rather than crash the audit.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            write_manifest(repo_root / "ventures" / "subject", {})

            self.assertEqual(uncommitted_component_paths(repo_root, "ventures/subject"), [])

    def test_a_git_that_cannot_be_executed_degrades_instead_of_raising(self):
        """The OSError arm, which the no-repository case above does not reach.

        Outside a repository git runs fine and exits 128, so that test passes
        on the returncode guard and says nothing about the exception handler.
        Only a git that cannot be spawned at all exercises this one, and on a
        host without git every component would otherwise crash the audit
        instead of failing it with a usable message.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            with unittest.mock.patch.object(
                coverage_ratchet.subprocess, "run", side_effect=OSError("no git here")
            ):
                self.assertEqual(
                    uncommitted_component_paths(repo_root, "ventures/subject"), []
                )

    def test_a_failing_git_is_not_read_as_evidence(self):
        """A non-zero git says nothing about the tree, including when it printed.

        Without the returncode guard, whatever a broken git left on stdout
        would be parsed as a list of modified paths and reported to the reader
        as somebody's work in progress.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            broken = subprocess.CompletedProcess(
                args=["git"], returncode=128, stdout=" M ventures/subject/real.ts\n", stderr=""
            )
            with unittest.mock.patch.object(
                coverage_ratchet.subprocess, "run", return_value=broken
            ):
                self.assertEqual(
                    uncommitted_component_paths(repo_root, "ventures/subject"), []
                )


class DirtyTreeDiagnosisTest(unittest.TestCase):
    """The finding `run_coverage` returns when the tree it measured was not clean.

    Roughly twenty agent sessions share one working tree in this repository, so
    a gate reading a component mid-edit is ordinary rather than exceptional. On
    2026-08-04 the coverage ratchet reported

        ERROR [coverage-command-failed] print-atelier: coverage command exited 1
            -> A failing suite has no meaningful coverage. Fix the suite first.

    while print-atelier's suite was entirely healthy: another session had a
    not-yet-passing test file on disk for the length of one red-green cycle.
    Both the recorded failure and the commit it was blamed on were clean, and
    finding that out cost a full diagnosis. The verdict was right and the
    sentence sent the reader somewhere there was nothing to fix.
    """

    def _entry(self, path: str, command: list) -> dict:
        return {"id": "component-under-test", "path": path, "command": command}

    def _failing(self) -> list:
        return ["node", "-e", "console.error('AssertionError: nope'); process.exit(1)"]

    def test_a_failure_on_a_dirty_component_names_the_uncommitted_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {"dependencies": {"tsx": "^4.0.0"}})
            (component / "node_modules").mkdir()
            commit_all(repo_root)
            (component / "in-progress.test.ts").write_text("// half written\n")

            measurement, finding = run_coverage(
                repo_root, self._entry("ventures/subject", self._failing())
            )

            self.assertIsNone(measurement)
            self.assertIsNotNone(finding, "a dirty tree is never a reason to skip")
            self.assertEqual(finding.severity, "error", "the verdict does not soften")
            self.assertEqual(finding.code, "coverage-measured-dirty-tree")
            self.assertIn("in-progress.test.ts", finding.message)
            self.assertIn(
                "AssertionError: nope",
                finding.message,
                "the underlying reason must survive the reframing",
            )
            self.assertIn("clean checkout", finding.remedy)
            self.assertNotIn("Fix the suite first", finding.remedy)

    def test_a_failure_on_a_clean_component_is_still_blamed_on_the_suite(self):
        """The direction that must not drift.

        If a clean tree could produce this diagnosis, the gate would have an
        excuse available on every failure, which is how a control stops meaning
        anything.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {"dependencies": {"tsx": "^4.0.0"}})
            (component / "node_modules").mkdir()
            commit_all(repo_root)

            _, finding = run_coverage(
                repo_root, self._entry("ventures/subject", self._failing())
            )

            self.assertEqual(finding.code, "coverage-command-failed")
            self.assertIn("Fix the suite first", finding.remedy)

    def test_a_passing_component_is_unaffected_by_a_dirty_tree(self):
        """Dirtiness only ever words a failure; it never creates one."""
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {})
            commit_all(repo_root)
            (component / "in-progress.test.ts").write_text("// half written\n")

            lcov = "TN:\nSF:src/a.ts\nDA:1,1\nLF:1\nLH:1\nend_of_record\n"
            script = (
                "const fs=require('fs');"
                f"fs.writeFileSync(process.env.COVERAGE_LCOV_DESTINATION,{json.dumps(lcov)});"
            )
            measurement, finding = run_coverage(
                repo_root, self._entry("ventures/subject", ["node", "-e", script])
            )

            self.assertIsNone(finding, f"a dirty tree must not fail a green suite: {finding}")
            self.assertIsNotNone(measurement)

    def test_uninstalled_dependencies_still_win_over_the_dirty_tree(self):
        """Ordering check, in the style of the missing-path test above.

        A component with no `node_modules` is dirty in this fixture *because*
        of the uninstalled state, and 'install the dependencies' is the
        actionable repair. Reporting the tree first would bury it.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {"devDependencies": {"tsx": "^4.0.0"}})
            commit_all(repo_root)
            (component / "in-progress.test.ts").write_text("// half written\n")

            _, finding = run_coverage(
                repo_root,
                self._entry("ventures/subject", ["node", "--import", "tsx", "-e", ""]),
            )

            self.assertEqual(finding.code, "component-dependencies-missing")

    def test_the_components_own_artifacts_do_not_count_as_dirtiness(self):
        """Measured before the run, and this is what that buys.

        A coverage run writes inside the component it measures — `run_coverage`
        makes `coverage/.tmp` itself, and real commands drop reports beside it.
        Reading the tree afterwards would find those on every single run, so
        every failure would be reported as measured against a dirty tree, and a
        diagnosis that fires unconditionally says exactly as much as no
        diagnosis at all. That is the failure mode this file exists to prevent,
        rebuilt one layer up.

        The command below therefore writes a real file into the component and
        then fails, which is the only version of this test that distinguishes
        the two orderings: an empty `coverage/.tmp` cannot, because git does not
        report empty directories, and an earlier draft of this test passed
        against a deliberately mis-ordered implementation for that reason.
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            init_repo(repo_root)
            component = repo_root / "ventures" / "subject"
            write_manifest(component, {"dependencies": {"tsx": "^4.0.0"}})
            (component / "node_modules" / ".keep").parent.mkdir()
            (component / "node_modules" / ".keep").write_text("")
            commit_all(repo_root)

            writes_then_fails = (
                "const fs=require('fs');"
                "fs.mkdirSync('coverage',{recursive:true});"
                "fs.writeFileSync('coverage/lcov.info','TN:\\n');"
                "console.error('AssertionError: nope');"
                "process.exit(1);"
            )
            _, finding = run_coverage(
                repo_root,
                self._entry("ventures/subject", ["node", "-e", writes_then_fails]),
            )

            self.assertTrue(
                (component / "coverage" / "lcov.info").is_file(),
                "precondition: the run leaves a file inside the component",
            )
            self.assertEqual(
                finding.code,
                "coverage-command-failed",
                "the run's own output must not read as someone's work in progress",
            )


if __name__ == "__main__":
    unittest.main()
