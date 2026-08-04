#!/usr/bin/env python3
"""
Unit and contract tests for the cap ratchet.

This control exists because a cap was raised the day after it was added, so the
tests that matter are the ones proving it refuses. Most of these assert the
failing direction: a constant walked up in one step, a constant walked up in
three small steps across separate commits, a YAML ceiling raised, a cap deleted
outright, and a cap replaced by an expression the parser cannot reduce to a
number. Each of those is a way to make a ceiling stop being one, and each has
to be a failure rather than a skip.

The measurement half runs against real temporary git repositories. A history
ratchet tested only against hand-built readings is a ratchet proven correct
about numbers nobody checked came from git — which is precisely the defect
shape this repository keeps finding in its own controls.

The last group is a contract over the live repository: every cap that bounds a
declared budget must appear in WATCHES. Without it the control passes forever
by watching nothing, the way `scripts/ci/test-engineering-policy.sh` once
proved the coverage floor by grepping for a sentence about it.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import ast
import subprocess
import tempfile
import textwrap
import unittest

import cap_ratchet
from cap_ratchet import (
    WATCHES,
    CapError,
    Watch,
    evaluate,
    extract_python_constant,
    extract_yaml_path,
    measure,
)


def git(repo: Path, *args: str) -> str:
    env = dict(sys.modules["os"].environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    proc = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    return proc.stdout


def init_repo(repo: Path) -> None:
    git(repo, "init", "--quiet", "--initial-branch=main")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Cap Ratchet Tests")
    git(repo, "config", "commit.gpgsign", "false")


def write_and_commit(repo: Path, rel: str, body: str, message: str) -> str:
    target = repo / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(textwrap.dedent(body), encoding="utf-8")
    git(repo, "add", rel)
    git(repo, "commit", "--quiet", "-m", message)
    return git(repo, "rev-parse", "HEAD").strip()


def constant_file(value) -> str:
    return f"""
        \"\"\"A control with a cap.\"\"\"

        MAX_THING = {value}


        def main():
            return MAX_THING
        """


def budget_file(value) -> str:
    return f"""
        owner: duncan
        budget:
          max_thing: {value}
        """


CONST_WATCH = Watch(
    path="scripts/ci/thing.py",
    kind="python-constant",
    locator="MAX_THING",
    why="the ceiling on things",
)

YAML_WATCH = Watch(
    path="platform/thing-budget.yaml",
    kind="yaml-path",
    locator="budget.max_thing",
    why="the declared number of things",
)


class ExtractPythonConstantTests(unittest.TestCase):
    def test_reads_a_plain_integer(self):
        self.assertEqual(extract_python_constant("MAX_X = 150\n", "MAX_X"), 150.0)

    def test_reads_a_float(self):
        self.assertEqual(extract_python_constant("MAX_X = 2.0\n", "MAX_X"), 2.0)

    def test_reads_a_negated_number(self):
        self.assertEqual(extract_python_constant("MAX_X = -3\n", "MAX_X"), -3.0)

    def test_absent_constant_is_none(self):
        self.assertIsNone(extract_python_constant("MAX_Y = 1\n", "MAX_X"))

    def test_a_constant_that_is_an_expression_is_none(self):
        # `MAX_X = BASE * 2` is a legal way to hide a raise behind arithmetic.
        # The parser refuses to reduce it, and `measure` turns that into a
        # failure rather than a skip.
        self.assertIsNone(extract_python_constant("BASE = 90\nMAX_X = BASE * 2\n", "MAX_X"))

    def test_a_constant_defined_inside_a_function_is_not_module_level(self):
        source = "def f():\n    MAX_X = 999\n    return MAX_X\n"
        self.assertIsNone(extract_python_constant(source, "MAX_X"))

    def test_a_syntactically_broken_module_is_none_not_a_crash(self):
        self.assertIsNone(extract_python_constant("MAX_X = = 3\n", "MAX_X"))

    def test_the_module_is_never_executed_to_read_it(self):
        # Importing a control to audit it lets the control decide whether it is
        # audited. This asserts the read is static.
        source = "import sys\nsys.exit(99)\nMAX_X = 7\n"
        self.assertEqual(extract_python_constant(source, "MAX_X"), 7.0)


class ExtractYamlPathTests(unittest.TestCase):
    def test_reads_a_dotted_path(self):
        self.assertEqual(extract_yaml_path("budget:\n  max_thing: 12\n", "budget.max_thing"), 12.0)

    def test_absent_path_is_none(self):
        self.assertIsNone(extract_yaml_path("budget:\n  other: 12\n", "budget.max_thing"))

    def test_a_non_numeric_value_is_none(self):
        self.assertIsNone(extract_yaml_path("budget:\n  max_thing: unlimited\n", "budget.max_thing"))

    def test_a_boolean_is_not_a_number(self):
        # YAML `true` is an int subclass in Python. `max_thing: true` must not
        # read as the number 1.
        self.assertIsNone(extract_yaml_path("budget:\n  max_thing: true\n", "budget.max_thing"))

    def test_broken_yaml_is_none_not_a_crash(self):
        self.assertIsNone(extract_yaml_path("budget:\n  - [\n", "budget.max_thing"))


class HistoryFloorTests(unittest.TestCase):
    """The ratchet property, measured against real git history."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        init_repo(self.repo)

    def test_a_value_at_its_only_recorded_level_passes(self):
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(evaluate(measurement), [])
        self.assertEqual(measurement.readings[0].floor, 150.0)

    def test_a_value_raised_in_the_working_tree_fails(self):
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        (self.repo / CONST_WATCH.path).write_text(
            textwrap.dedent(constant_file(170)), encoding="utf-8"
        )
        findings = evaluate(measure(self.repo, [CONST_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "cap-raised")
        self.assertIn("170", findings[0].message)
        self.assertIn("150", findings[0].message)

    def test_a_value_raised_and_committed_still_fails(self):
        # Committing the raise is the normal case, not an edge case: the tamper
        # this control was written for arrived as an ordinary commit.
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(170), "raise cap")
        findings = evaluate(measure(self.repo, [CONST_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "cap-raised")

    def test_a_value_walked_up_in_small_steps_fails(self):
        # The reason the floor is the historical minimum rather than the value
        # at HEAD. Every step here is legal against the step before it.
        for value in (150, 155, 160, 165):
            write_and_commit(self.repo, CONST_WATCH.path, constant_file(value), f"nudge to {value}")
        findings = evaluate(measure(self.repo, [CONST_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertIn("150", findings[0].message)

    def test_lowering_a_value_passes_and_becomes_the_new_floor(self):
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(120), "lower cap")
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(evaluate(measurement), [])
        self.assertEqual(measurement.readings[0].floor, 120.0)

    def test_a_value_lowered_then_raised_back_to_the_old_level_fails(self):
        # Once lowered, the lower number is the ceiling forever. Returning to
        # the previous ceiling is the exact move this refuses.
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(120), "lower cap")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "put it back")
        findings = evaluate(measure(self.repo, [CONST_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertIn("120", findings[0].message)

    def test_a_first_appearance_sets_the_floor_and_is_reported(self):
        (self.repo / CONST_WATCH.path).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / CONST_WATCH.path).write_text(
            textwrap.dedent(constant_file(150)), encoding="utf-8"
        )
        # Something must exist in the repo for `git log` to work at all.
        write_and_commit(self.repo, "README.md", "placeholder\n", "init")
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(evaluate(measurement), [])
        self.assertTrue(measurement.readings[0].first_appearance)
        self.assertEqual(measurement.readings[0].floor, 150.0)

    def test_a_revision_predating_the_constant_does_not_become_the_floor(self):
        # The file existed before the cap was added to it. Those revisions have
        # no value to compare against and must be skipped, not read as zero.
        write_and_commit(self.repo, CONST_WATCH.path, "\"\"\"No cap yet.\"\"\"\n", "add file")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(evaluate(measurement), [])
        self.assertEqual(measurement.readings[0].floor, 150.0)
        self.assertEqual(measurement.readings[0].revisions_seen, 1)

    def test_yaml_ceilings_ratchet_the_same_way(self):
        write_and_commit(self.repo, YAML_WATCH.path, budget_file(135), "declare budget")
        (self.repo / YAML_WATCH.path).write_text(
            textwrap.dedent(budget_file(165)), encoding="utf-8"
        )
        findings = evaluate(measure(self.repo, [YAML_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertIn("165", findings[0].message)

    def test_one_history_walk_covers_several_watches_in_one_file(self):
        body = """
            MAX_A = 10
            MAX_B = 20
            """
        write_and_commit(self.repo, "scripts/ci/two.py", body, "add two caps")
        raised = """
            MAX_A = 10
            MAX_B = 25
            """
        (self.repo / "scripts/ci/two.py").write_text(textwrap.dedent(raised), encoding="utf-8")
        watches = [
            Watch(path="scripts/ci/two.py", kind="python-constant", locator="MAX_A", why="a"),
            Watch(path="scripts/ci/two.py", kind="python-constant", locator="MAX_B", why="b"),
        ]
        findings = evaluate(measure(self.repo, watches))
        self.assertEqual(len(findings), 1)
        self.assertIn("MAX_B", findings[0].message)


class FailsClosedTests(unittest.TestCase):
    """A missing input is a failure, not a pass for work that was never done."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        init_repo(self.repo)

    def test_a_missing_watched_file_raises(self):
        write_and_commit(self.repo, "README.md", "placeholder\n", "init")
        with self.assertRaises(CapError) as caught:
            measure(self.repo, [CONST_WATCH])
        self.assertIn("missing", str(caught.exception))

    def test_a_deleted_constant_raises_rather_than_passing(self):
        # Deleting the cap is the cheapest way to stop it capping anything.
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        (self.repo / CONST_WATCH.path).write_text("\"\"\"Nothing here.\"\"\"\n", encoding="utf-8")
        with self.assertRaises(CapError) as caught:
            measure(self.repo, [CONST_WATCH])
        self.assertIn("MAX_THING", str(caught.exception))

    def test_a_constant_replaced_by_an_expression_raises(self):
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        (self.repo / CONST_WATCH.path).write_text(
            "BASE = 90\nMAX_THING = BASE * 2\n", encoding="utf-8"
        )
        with self.assertRaises(CapError) as caught:
            measure(self.repo, [CONST_WATCH])
        self.assertIn("plain number", str(caught.exception))

    def test_a_yaml_ceiling_replaced_by_a_word_raises(self):
        write_and_commit(self.repo, YAML_WATCH.path, budget_file(135), "declare budget")
        (self.repo / YAML_WATCH.path).write_text(
            "owner: duncan\nbudget:\n  max_thing: unlimited\n", encoding="utf-8"
        )
        with self.assertRaises(CapError):
            measure(self.repo, [YAML_WATCH])

    def test_a_shallow_clone_raises_rather_than_reading_a_one_revision_floor(self):
        # `actions/checkout` defaults to fetch-depth 1. Under that default every
        # raise that already landed would read as "at floor", so the gate would
        # pass on precisely the history it exists to read.
        for value in (150, 170):
            write_and_commit(self.repo, CONST_WATCH.path, constant_file(value), f"set {value}")
        env = dict(sys.modules["os"].environ)
        env["GIT_CONFIG_GLOBAL"] = "/dev/null"
        env["GIT_CONFIG_SYSTEM"] = "/dev/null"
        with tempfile.TemporaryDirectory() as shallow_dir:
            shallow = Path(shallow_dir) / "shallow"
            subprocess.run(
                ["git", "clone", "--quiet", "--depth", "1", f"file://{self.repo}", str(shallow)],
                check=True,
                capture_output=True,
                env=env,
            )
            self.assertEqual(
                subprocess.run(
                    ["git", "rev-parse", "--is-shallow-repository"],
                    cwd=shallow,
                    capture_output=True,
                    text=True,
                    env=env,
                    check=True,
                ).stdout.strip(),
                "true",
                "the fixture is not actually shallow, so this test proves nothing",
            )
            with self.assertRaises(CapError) as caught:
                measure(shallow, [CONST_WATCH])
            self.assertIn("shallow", str(caught.exception))

    def test_an_unknown_watch_kind_raises(self):
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        bogus = Watch(path=CONST_WATCH.path, kind="telepathy", locator="MAX_THING", why="x")
        with self.assertRaises(CapError):
            measure(self.repo, [bogus])

    def test_the_cli_exits_nonzero_on_a_finding(self):
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(170), "raise cap")
        original = cap_ratchet.WATCHES
        cap_ratchet.WATCHES = (CONST_WATCH,)
        try:
            self.assertEqual(cap_ratchet.main(["--repo-root", str(self.repo)]), 1)
            # `--report` measures and prints without gating, so it stays 0.
            self.assertEqual(cap_ratchet.main(["--repo-root", str(self.repo), "--report"]), 0)
        finally:
            cap_ratchet.WATCHES = original


class RepositoryContractTests(unittest.TestCase):
    """What is watched must be everything there is to watch."""

    def test_every_watched_file_and_locator_resolves_today(self):
        # If a watched file is renamed and nobody updates WATCHES, this control
        # would otherwise fail closed only at CI time on someone else's change.
        for watch in WATCHES:
            with self.subTest(watch=f"{watch.path}:{watch.locator}"):
                path = REPO_ROOT / watch.path
                self.assertTrue(path.is_file(), f"{watch.path} does not exist")
                value = cap_ratchet.extract(watch, path.read_text(encoding="utf-8"))
                self.assertIsNotNone(value, f"{watch.path}:{watch.locator} did not resolve")

    def test_every_max_declared_constant_in_the_ci_scripts_is_watched(self):
        """The contract that stops this control from watching nothing.

        Any module-level constant in `scripts/ci/` named `MAX_*` bounds a
        declared budget by construction — that is what the prefix means in this
        repository. Adding one without adding it here would create a new
        unwatched ceiling, which is the hole this whole file exists to close.
        """
        watched = {(w.path, w.locator) for w in WATCHES if w.kind == "python-constant"}
        missing = []
        for script in sorted((REPO_ROOT / "scripts" / "ci").glob("*.py")):
            if script.name == "cap_ratchet.py":
                continue
            rel = str(script.relative_to(REPO_ROOT))
            tree = ast.parse(script.read_text(encoding="utf-8"))
            for node in tree.body:
                if not isinstance(node, ast.Assign):
                    continue
                for target in node.targets:
                    if not isinstance(target, ast.Name):
                        continue
                    name = target.id
                    if not name.startswith("MAX_"):
                        continue
                    if not isinstance(node.value, ast.Constant):
                        continue
                    if not isinstance(node.value.value, (int, float)):
                        continue
                    if (rel, name) not in watched:
                        missing.append(f"{rel}:{name}")
        self.assertEqual(
            missing,
            [],
            "These bound a declared budget but nothing stops them being raised. "
            "Add them to WATCHES in scripts/ci/cap_ratchet.py: " + ", ".join(missing),
        )

    def test_no_watch_is_declared_twice(self):
        keys = [(w.path, w.kind, w.locator) for w in WATCHES]
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_watch_explains_what_the_number_is(self):
        for watch in WATCHES:
            with self.subTest(watch=watch.locator):
                self.assertGreater(len(watch.why), 20)


if __name__ == "__main__":
    unittest.main()
