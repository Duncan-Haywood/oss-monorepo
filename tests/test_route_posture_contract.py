"""
Contract tests for the route auth-posture audit.

The audit's whole value is that it fails in specific directions, so most of
this file drives it into each failure and asserts it goes red. A validator
only ever exercised against a healthy repository is indistinguishable from
`return 0`, which is the failure mode it was written to catch elsewhere.
"""

from __future__ import annotations

import datetime as dt
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import route_posture_contract as rpc


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(text), encoding="utf-8")


class FakeRepo:
    """A minimal repository with the directories the audit locates itself by."""

    def __init__(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "ventures").mkdir()
        (self.root / "platform").mkdir()
        (self.root / "scripts").mkdir()

    def close(self) -> None:
        self.tmp.cleanup()

    def route(self, venture: str, path: str, methods: str = "GET") -> None:
        body = "\n".join(f"export async function {m}(req) {{ return new Response(); }}"
                         for m in methods.split(","))
        write(self.root / "ventures" / venture / "src/app/api" / path / "route.ts", body)

    def registry(self, body: str) -> None:
        write(self.root / rpc.REGISTRY_PATH, body)

    def package_json(self, venture: str, test_script: str) -> None:
        write(self.root / "ventures" / venture / "package.json",
              '{"name": "%s", "scripts": {"test": "%s"}}' % (venture, test_script))

    def test_ci(self, body: str) -> None:
        write(self.root / rpc.TEST_CI_PATH, body)

    def codes(self, today: dt.date | None = None) -> list[str]:
        return [f.code for f in rpc.audit(self.root, today=today or dt.date(2026, 8, 1))]


class MeasurementTest(unittest.TestCase):
    """The audit must count what the venture actually serves."""

    def setUp(self) -> None:
        self.repo = FakeRepo()
        self.addCleanup(self.repo.close)

    def test_counts_route_modules_and_handlers(self) -> None:
        self.repo.route("v1", "health")
        self.repo.route("v1", "users", methods="GET,POST,DELETE")
        surface = rpc.measure_surface(self.repo.root, "v1")
        self.assertEqual(surface.route_file_count, 2)
        self.assertEqual(surface.handler_count, 4)

    def test_counts_route_tsx_not_only_route_ts(self) -> None:
        """Pairwise's /api/og/couple-card is a route.tsx; a .ts-only scan misses it."""
        write(self.repo.root / "ventures/v1/src/app/api/og/route.tsx",
              "export async function GET(req) { return new Response(); }")
        self.assertEqual(rpc.measure_surface(self.repo.root, "v1").handler_count, 1)

    def test_ignores_node_modules_and_next_build_output(self) -> None:
        self.repo.route("v1", "real")
        write(self.repo.root / "ventures/v1/node_modules/pkg/src/app/api/x/route.ts",
              "export async function GET() {}")
        write(self.repo.root / "ventures/v1/.next/server/app/api/x/route.ts",
              "export async function GET() {}")
        self.assertEqual(rpc.measure_surface(self.repo.root, "v1").route_file_count, 1)

    def test_a_venture_with_no_routes_is_not_required_to_register(self) -> None:
        write(self.repo.root / "ventures/docs-only/README.md", "# docs")
        self.assertNotIn("docs-only", rpc.discover_surfaces(self.repo.root))


class FailsClosedTest(unittest.TestCase):
    """Each of these is a way the control could be defeated. All must go red."""

    def setUp(self) -> None:
        self.repo = FakeRepo()
        self.addCleanup(self.repo.close)
        self.repo.route("v1", "health")

    def test_a_venture_with_routes_and_no_entry_fails(self) -> None:
        self.repo.registry("ventures: []")
        self.assertIn("unregistered-route-surface", self.repo.codes())

    def test_a_new_route_makes_the_declared_count_stale(self) -> None:
        """The case the contract exists to catch: an endpoint nobody declared."""
        contract = self.repo.root / "ventures/v1/tests/posture.test.ts"
        write(contract, "// contract")
        self.repo.package_json("v1", "vitest run")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/tests/posture.test.ts
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertEqual(self.repo.codes(), [])
        self.repo.route("v1", "admin-backdoor", methods="POST")
        self.assertIn("stale-count", self.repo.codes())

    def test_a_deleted_route_also_fails(self) -> None:
        """Below the declared count means the contract still claims a dead route."""
        contract = self.repo.root / "ventures/v1/tests/posture.test.ts"
        write(contract, "// contract")
        self.repo.package_json("v1", "vitest run")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/tests/posture.test.ts
                execution: venture-test-gate
                route_files: 5
                handlers: 9
                owner: duncan
        """)
        self.assertIn("stale-count", self.repo.codes())

    def test_a_contract_no_gate_runs_fails(self) -> None:
        """The load-bearing check: ai-first-markets' real defect, reproduced."""
        write(self.repo.root / "ventures/v1/src/lib/posture.test.ts", "// contract")
        self.repo.package_json("v1", "vitest run")
        self.repo.test_ci("# no gate for v1\n")
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/src/lib/posture.test.ts
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertIn("unexecuted-contract", self.repo.codes())

    def test_a_contract_outside_the_test_scripts_glob_fails(self) -> None:
        """
        sh has no globstar, so `src/**/*.test.ts` reaches one level only. A
        contract placed deeper silently stops running with no error anywhere.
        This is live in ai-first-markets today.
        """
        write(self.repo.root / "ventures/v1/src/lib/deep/posture.test.ts", "// contract")
        self.repo.package_json("v1", "node --test src/**/*.test.ts")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/src/lib/deep/posture.test.ts
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertIn("unexecuted-contract", self.repo.codes())

    def test_the_same_contract_one_level_shallower_passes(self) -> None:
        """The mirror of the test above: the check is depth-sensitive, not blanket."""
        write(self.repo.root / "ventures/v1/src/lib/posture.test.ts", "// contract")
        self.repo.package_json("v1", "node --test src/**/*.test.ts")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/src/lib/posture.test.ts
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertEqual(self.repo.codes(), [])

    def test_a_declared_contract_file_that_does_not_exist_fails(self) -> None:
        self.repo.package_json("v1", "vitest run")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/tests/does-not-exist.test.ts
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertIn("missing-contract", self.repo.codes())

    def test_an_exemption_naming_a_nonexistent_contract_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/tests/imaginary.test.ts
                execution: none
                exempt_until: 2026-09-01
                route_files: 1
                handlers: 1
                owner: duncan
                reason: not wired yet
        """)
        self.assertIn("missing-contract", self.repo.codes())

    def test_an_expired_exemption_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: null
                execution: none
                exempt_until: 2026-07-01
                route_files: 1
                handlers: 1
                owner: duncan
                reason: still being written
        """)
        self.assertIn("expired-exemption", self.repo.codes())

    def test_an_exemption_without_an_expiry_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: null
                execution: none
                route_files: 1
                handlers: 1
                owner: duncan
                reason: indefinitely postponed
        """)
        self.assertIn("unexpiring-exemption", self.repo.codes())

    def test_an_exemption_beyond_the_horizon_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: null
                execution: none
                exempt_until: 2030-01-01
                route_files: 1
                handlers: 1
                owner: duncan
                reason: parked
        """)
        self.assertIn("exemption-too-distant", self.repo.codes())

    def test_an_exemption_without_a_reason_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: null
                execution: none
                exempt_until: 2026-09-01
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertIn("unjustified-exemption", self.repo.codes())

    def test_an_invented_execution_label_fails(self) -> None:
        """Relabelling must not launder a dead contract into a live one."""
        write(self.repo.root / "ventures/v1/tests/posture.test.ts", "// contract")
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/tests/posture.test.ts
                execution: trust-me
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertIn("invalid-execution", self.repo.codes())

    def test_an_entry_for_a_venture_with_no_routes_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: ghost
                contract: null
                execution: none
                exempt_until: 2026-09-01
                route_files: 1
                handlers: 1
                owner: duncan
                reason: gone
              - venture: v1
                contract: null
                execution: none
                exempt_until: 2026-09-01
                route_files: 1
                handlers: 1
                owner: duncan
                reason: pending
        """)
        self.assertIn("stale-entry", self.repo.codes())

    def test_a_missing_registry_fails_rather_than_passing_empty(self) -> None:
        with self.assertRaises(SystemExit):
            rpc.audit(self.repo.root)

    def test_an_incomplete_entry_fails(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                execution: venture-test-gate
        """)
        self.assertIn("incomplete-entry", self.repo.codes())

    def test_a_non_exempt_entry_must_name_a_contract(self) -> None:
        self.repo.package_json("v1", "vitest run")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: null
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)
        self.assertIn("incomplete-entry", self.repo.codes())


class CoverageRatchetWiringTest(unittest.TestCase):
    """The coverage-ratchet execution route must prove the command reaches the file."""

    def setUp(self) -> None:
        self.repo = FakeRepo()
        self.addCleanup(self.repo.close)
        self.repo.route("v1", "health")
        write(self.repo.root / "ventures/v1/tests/posture.test.ts", "// contract")

    def _baseline(self, path: str, glob: str) -> None:
        write(self.repo.root / rpc.COVERAGE_BASELINE_PATH, f"""
            components:
              - id: v1
                path: {path}
                command:
                  - node
                  - --test
                  - {glob}
        """)

    def _registry(self) -> None:
        self.repo.registry("""
            ventures:
              - venture: v1
                contract: ventures/v1/tests/posture.test.ts
                execution: coverage-ratchet
                route_files: 1
                handlers: 1
                owner: duncan
        """)

    def test_a_component_whose_glob_covers_the_contract_passes(self) -> None:
        self._baseline("ventures/v1", "tests/*.test.ts")
        self._registry()
        self.assertEqual(self.repo.codes(), [])

    def test_a_component_whose_glob_misses_the_contract_fails(self) -> None:
        self._baseline("ventures/v1", "tests/other-*.test.ts")
        self._registry()
        self.assertIn("unexecuted-contract", self.repo.codes())

    def test_no_component_for_the_venture_fails(self) -> None:
        self._baseline("ventures/somewhere-else", "tests/*.test.ts")
        self._registry()
        self.assertIn("unexecuted-contract", self.repo.codes())


class VitestSelectionTest(unittest.TestCase):
    """`execution: venture-test-gate` must read the vitest config, not the filename.

    The check used to answer "does vitest run this file?" by asking whether the
    *name* ended in `.test.ts`. `ventures/quick-pick-survey/vitest.config.ts`
    excludes `**/*.integration.test.ts` and includes only `src/**`, so a
    contract named or placed either way was reported as executed while vitest
    declined to run it — the exact defect this module's docstring says it exists
    to close, reproduced inside the audit.
    """

    def setUp(self) -> None:
        self.repo = FakeRepo()
        self.addCleanup(self.repo.close)
        self.repo.route("v1", "health")
        self.repo.package_json("v1", "vitest run")
        self.repo.test_ci('run_ci_test "V1" npm --prefix "${REPO_ROOT}/ventures/v1" test\n')

    def _config(self, body: str) -> None:
        write(self.repo.root / "ventures/v1/vitest.config.ts", body)

    def _registry(self, contract: str) -> None:
        self.repo.registry(f"""
            ventures:
              - venture: v1
                contract: {contract}
                execution: venture-test-gate
                route_files: 1
                handlers: 1
                owner: duncan
        """)

    def test_a_contract_the_vitest_config_excludes_is_not_executed(self) -> None:
        """quick-pick-survey's real config, with the contract named to match it."""
        self._config("""
            export default {
              test: {
                include: ["src/**/*.test.ts"],
                exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
              },
            };
        """)
        write(self.repo.root / "ventures/v1/src/lib/posture.integration.test.ts", "// contract")
        write(self.repo.root / "ventures/v1/src/lib/other.test.ts", "// a suite that does run")
        self._registry("ventures/v1/src/lib/posture.integration.test.ts")
        self.assertIn("unexecuted-contract", self.repo.codes())

    def test_the_same_contract_the_config_does_not_exclude_passes(self) -> None:
        """The mirror, so the check is config-sensitive rather than blanket."""
        self._config("""
            export default {
              test: {
                include: ["src/**/*.test.ts"],
                exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
              },
            };
        """)
        write(self.repo.root / "ventures/v1/src/lib/posture.test.ts", "// contract")
        self._registry("ventures/v1/src/lib/posture.test.ts")
        self.assertEqual(self.repo.codes(), [])

    def test_a_contract_outside_the_configured_include_root_is_not_executed(self) -> None:
        """`include: ["src/**"]` does not reach `tests/`, whatever the suffix."""
        self._config("""
            export default { test: { include: ["src/**/*.test.ts"] } };
        """)
        write(self.repo.root / "ventures/v1/tests/posture.test.ts", "// contract")
        write(self.repo.root / "ventures/v1/src/lib/other.test.ts", "// a suite that does run")
        self._registry("ventures/v1/tests/posture.test.ts")
        self.assertIn("unexecuted-contract", self.repo.codes())

    def test_an_include_that_selects_nothing_is_not_a_passing_gate(self) -> None:
        """A glob matching zero files exits 0 and looks exactly like green."""
        self._config("""
            export default { test: { include: ["nowhere/**/*.test.ts"] } };
        """)
        write(self.repo.root / "ventures/v1/src/lib/posture.test.ts", "// contract")
        self._registry("ventures/v1/src/lib/posture.test.ts")
        self.assertIn("unexecuted-contract", self.repo.codes())

    def test_a_glob_inside_a_config_string_is_not_eaten_as_a_comment(self) -> None:
        """`"src/**/*.test.ts"` contains `/*`. A regex comment stripper swallows
        the rest of the config from inside the glob and leaves an include list
        that matches nothing — which the vacuity check would then report as a
        broken gate on a config that is perfectly fine."""
        source = rpc._strip_js_comments(
            'export default { test: { include: ["src/**/*.test.ts"] } }; // trailing\n'
        )
        self.assertIn('"src/**/*.test.ts"', source)
        self.assertNotIn("trailing", source)

    def test_a_single_star_does_not_cross_a_directory_boundary(self) -> None:
        """fnmatch's `*` spans `/`, which is what made every include look satisfied."""
        self.assertFalse(rpc.glob_matches_path("*.test.ts", "src/lib/a.test.ts"))
        self.assertTrue(rpc.glob_matches_path("src/**/*.test.ts", "src/lib/a.test.ts"))
        self.assertTrue(rpc.glob_matches_path("**/*.test.ts", "a.test.ts"))
        self.assertFalse(rpc.glob_matches_path("src/**/*.test.ts", "tests/a.test.ts"))


class PrunedDirectoryTest(unittest.TestCase):
    """The one shared rule both this audit and the SAST gate descend by."""

    def setUp(self) -> None:
        self.repo = FakeRepo()
        self.addCleanup(self.repo.close)
        self.root = self.repo.root / "ventures/v1"

    def test_an_app_router_build_segment_is_kept(self) -> None:
        target = self.root / "src/app/api/build"
        target.mkdir(parents=True)
        self.assertFalse(rpc.is_pruned_dir(target, self.root))

    def test_build_output_outside_an_app_tree_is_pruned(self) -> None:
        target = self.root / "dist"
        target.mkdir(parents=True)
        self.assertTrue(rpc.is_pruned_dir(target, self.root))

    def test_a_vendored_directory_is_pruned_even_inside_an_app_tree(self) -> None:
        target = self.root / "src/app/node_modules"
        target.mkdir(parents=True)
        self.assertTrue(rpc.is_pruned_dir(target, self.root))


class RepositoryContractTest(unittest.TestCase):
    """The real repository, on every push."""

    def test_every_vitest_venture_really_selects_its_declared_contract(self) -> None:
        """Read the real configs, not a guess about them.

        Non-vacuous by construction: it asserts at least one registry entry
        actually goes through the vitest path, so the loop cannot pass by
        iterating over nothing.
        """
        import shlex as _shlex

        checked = 0
        for entry in rpc.load_registry(REPO_ROOT):
            contract = entry.get("contract")
            if entry.get("execution") != "venture-test-gate" or not contract:
                continue
            script, cwd = rpc.npm_test_script(REPO_ROOT, str(entry["venture"]),
                                              REPO_ROOT / str(contract))
            tokens = _shlex.split(script or "")
            if not rpc.is_vitest_invocation(tokens) or rpc.vitest_path_arguments(tokens):
                continue
            checked += 1
            selection = rpc.resolve_vitest_selection(cwd, tokens)
            self.assertNotEqual(selection.candidates, [],
                                f"{entry['venture']}: {selection.where} selects no file")
            self.assertTrue(selection.selects(REPO_ROOT / str(contract)),
                            f"{entry['venture']}: {selection.where} does not select {contract}")
        self.assertGreater(checked, 0, "no venture reached the vitest resolution path")

    def test_the_audit_passes_on_this_repository(self) -> None:
        findings = rpc.audit(REPO_ROOT)
        errors = [f.format() for f in findings if f.severity == "error"]
        self.assertEqual(errors, [], "\n".join(errors))

    def test_every_venture_serving_routes_is_registered(self) -> None:
        surfaces = rpc.discover_surfaces(REPO_ROOT)
        declared = {str(e.get("venture")) for e in rpc.load_registry(REPO_ROOT)}
        self.assertEqual(set(surfaces) - declared, set())

    def test_the_registry_is_not_vacuous(self) -> None:
        """A parser that silently found nothing would pass every check above."""
        surfaces = rpc.discover_surfaces(REPO_ROOT)
        self.assertGreaterEqual(len(surfaces), 5)
        self.assertGreaterEqual(sum(s.handler_count for s in surfaces.values()), 60)

    def test_cli_exits_zero_on_this_repository(self) -> None:
        self.assertEqual(rpc.main([]), 0)

    def test_cli_exits_nonzero_on_a_broken_registry(self) -> None:
        """End-to-end proof of the exit code CI actually branches on."""
        with tempfile.TemporaryDirectory() as tmp:
            clone = Path(tmp) / "repo"
            for name in ("ventures", "platform", "scripts"):
                shutil.copytree(REPO_ROOT / name, clone / name, symlinks=True,
                                ignore=shutil.ignore_patterns("node_modules", ".next", "*.pyc"))
            (clone / rpc.REGISTRY_PATH).write_text("ventures: []\n", encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(clone / "scripts/ci/route_posture_contract.py")],
                cwd=clone, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 1, completed.stdout + completed.stderr)
            self.assertIn("declares no route auth-posture contract", completed.stdout)
            # Every venture with a surface must be named, not just the first.
            for venture in ("quick-pick-survey", "print-atelier", "local-site-studio"):
                self.assertIn(venture, completed.stdout)


if __name__ == "__main__":
    unittest.main()
