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

That contract used to skip `cap_ratchet.py` itself, which made `MAX_REVISIONS`
— the history window every floor in the tower is measured from — the one number
in this repository that nothing watched, and lowering it always legal. It no
longer skips anything, and three tests here exist only for that number:
`MAX_REVISIONS` must be watched, it must be watched in the rising direction,
and the window it declares must still cover the full history of every watched
file as git reports it today. That last one is measured from git rather than
from the module, so it does not go quiet when the module's own history is the
thing being forged.


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

import subprocess
import tempfile
import textwrap
import unittest

import yaml

import cap_ratchet
from cap_ratchet import (
    DOWN,
    PREFIXES_MEANING_CEILING,
    UNWATCHED_BUDGET_KEYS,
    UP,
    WATCHES,
    CapError,
    Watch,
    declared_bound_constants,
    evaluate,
    extract_python_constant,
    extract_yaml_path,
    measure,
    module_constants,
)

# The one watch whose declared direction disagrees with its name, and the whole
# argument for it. `MAX_REVISIONS` is written as a maximum because it bounds the
# length of a git walk, but what it *means* is the minimum evidence any floor in
# the tower is allowed to rest on, so the direction it may move in is up.
#
# Deliberately a literal here rather than a registry in the module: an inversion
# is how a cap stops being ratcheted as a cap, so adding one has to be an edit to
# the test that enforces the rule, visible as such in the diff. This repository
# has already been bitten by agents answering a red gate with a new exemption and
# an invented reason.
INVERTED_DIRECTIONS = frozenset({("scripts/ci/cap_ratchet.py", "MAX_REVISIONS")})


def platform_budget_files() -> list:
    """Top-level `platform/*.yaml`, tracked or merely present.

    The union rather than `git ls-files` alone. A budget file that is on disk
    and not yet committed is exactly the state a new one is added in, and
    `scripts/ci/audit_exceptions.py` was already found blind to six advisories
    for the mirror-image reason — it read `git ls-files` and `platform/ci` had
    never been committed. Either half of the union missing a file is a budget
    number nobody is holding.
    """
    found = {p.name for p in (REPO_ROOT / "platform").glob("*.yaml") if p.is_file()}
    env = dict(sys.modules["os"].environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    listed = subprocess.run(
        ["git", "ls-files", "platform/*.yaml"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    ).stdout.split()
    found.update(rel.split("/", 1)[1] for rel in listed if rel.count("/") == 1)
    return sorted(f"platform/{name}" for name in found)


def numeric_budget_leaves(source: str) -> list:
    """Every numeric leaf under a top-level `budget:` mapping, dotted."""
    try:
        data = yaml.safe_load(source)
    except yaml.YAMLError:
        return []
    if not isinstance(data, dict) or not isinstance(data.get("budget"), dict):
        return []

    leaves = []

    def walk(node: dict, prefix: str) -> None:
        for key, value in node.items():
            dotted = f"{prefix}.{key}"
            if isinstance(value, dict):
                walk(value, dotted)
            elif isinstance(value, bool):
                continue
            elif isinstance(value, (int, float)):
                leaves.append(dotted)

    walk(data["budget"], "budget")
    return leaves


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


def floor_file(value) -> str:
    return f"""
        \"\"\"A control with a safety floor.\"\"\"

        MIN_THING = {value}


        def main():
            return MIN_THING
        """


FLOOR_WATCH = Watch(
    path="scripts/ci/thing.py",
    kind="python-constant",
    locator="MIN_THING",
    why="the least a human must write before the suppression counts as reviewed",
    direction=UP,
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

    def test_reads_an_annotated_declaration(self):
        # `MAX_X: int = 9999` was unreadable *and* unenumerable, so it declared
        # a ceiling that neither half of this control could see.
        self.assertEqual(extract_python_constant("MAX_X: int = 9999\n", "MAX_X"), 9999.0)

    def test_a_bare_annotation_declares_no_number(self):
        self.assertIsNone(extract_python_constant("MAX_X: int\n", "MAX_X"))

    def test_a_chained_assignment_is_read(self):
        self.assertEqual(extract_python_constant("MAX_A = MAX_B = 5\n", "MAX_B"), 5.0)

    def test_a_constant_bound_twice_is_none_rather_than_its_first_value(self):
        # Reading the first binding would report a cap of 5 for a module whose
        # cap is 9999. None makes `measure` fail closed instead.
        self.assertIsNone(extract_python_constant("MAX_X = 5\nMAX_X = 9999\n", "MAX_X"))

    def test_a_boolean_is_not_a_number(self):
        self.assertIsNone(extract_python_constant("MAX_X = True\n", "MAX_X"))


class DeclaredBoundConstantTests(unittest.TestCase):
    """The enumeration the repository contract walks every control with.

    Deliberately the same reader `extract_python_constant` uses. When the two
    disagreed, a constant could be watched and unreadable, or readable and
    invisible to the contract that demands it be watched — and the audit found
    all three shapes of the second: `MAX_X: int = 9999`, `MAX_X = BASE * 4`,
    and `CAP_X = 9999` under a prefix nothing enumerated.
    """

    def names(self, source: str) -> list:
        return sorted(c.name for c in declared_bound_constants(source))

    def test_a_plain_max_is_found(self):
        self.assertEqual(self.names("MAX_X = 1\n"), ["MAX_X"])

    def test_an_annotated_max_is_found(self):
        found = declared_bound_constants("MAX_X: int = 9999\n")
        self.assertEqual([c.name for c in found], ["MAX_X"])
        self.assertEqual(found[0].value, 9999.0)

    def test_an_expression_valued_cap_is_found_but_carries_no_number(self):
        # `MAX_X = BASE * 4` must not read as absent: absent means "no such cap
        # here", and this is a cap declared in a way the ratchet cannot hold.
        found = declared_bound_constants("BASE = 90\nMAX_X = BASE * 4\n")
        self.assertEqual([c.name for c in found], ["MAX_X"])
        self.assertIsNone(found[0].value)

    def test_other_ceiling_prefixes_are_found(self):
        self.assertEqual(self.names("CAP_X = 9999\nLIMIT_Y = 3\n"), ["CAP_X", "LIMIT_Y"])

    def test_floor_prefixes_are_found(self):
        self.assertEqual(
            self.names("MIN_A = 1\nFLOOR_B = 2\nTHRESHOLD_C = 3\n"),
            ["FLOOR_B", "MIN_A", "THRESHOLD_C"],
        )

    def test_a_name_that_bounds_nothing_is_not_enumerated(self):
        self.assertEqual(self.names("DEFAULT_TIMEOUT_SECONDS = 25\nREQUIRED = ('a',)\n"), [])

    def test_a_constant_inside_a_function_is_not_module_level(self):
        self.assertEqual(self.names("def f():\n    MAX_X = 9999\n"), [])

    def test_the_direction_a_name_implies(self):
        found = {c.name: c.expected_direction for c in declared_bound_constants(
            "MAX_A = 1\nCAP_B = 1\nLIMIT_C = 1\nMIN_D = 1\nFLOOR_E = 1\nTHRESHOLD_F = 1\n"
        )}
        self.assertEqual(
            found,
            {
                "MAX_A": DOWN,
                "CAP_B": DOWN,
                "LIMIT_C": DOWN,
                "MIN_D": UP,
                "FLOOR_E": UP,
                "THRESHOLD_F": UP,
            },
        )

    def test_module_constants_reads_the_whole_module_not_just_bounds(self):
        found = module_constants("MAX_X = 1\nOTHER = 2\n")
        self.assertEqual(sorted(found), ["MAX_X", "OTHER"])


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
        self.assertEqual(measurement.readings[0].bound, 150.0)

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
        self.assertEqual(measurement.readings[0].bound, 120.0)

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
        self.assertEqual(measurement.readings[0].bound, 150.0)

    def test_a_revision_predating_the_constant_does_not_become_the_floor(self):
        # The file existed before the cap was added to it. Those revisions have
        # no value to compare against and must be skipped, not read as zero.
        write_and_commit(self.repo, CONST_WATCH.path, "\"\"\"No cap yet.\"\"\"\n", "add file")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(evaluate(measurement), [])
        self.assertEqual(measurement.readings[0].bound, 150.0)
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


class SafetyFloorTests(unittest.TestCase):
    """The other direction. A `MIN_*` moving DOWN is the same kind of weakening.

    `evaluate` only ever fired on `current > floor`, so every safety minimum in
    `scripts/ci/` — the least a human must write before a SAST finding counts
    as reviewed, the least an owner must write to overrule a fired stopping
    rule — could be taken to zero with this control reporting PASS.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        init_repo(self.repo)

    def test_a_floor_lowered_in_the_working_tree_fails(self):
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "add floor")
        (self.repo / FLOOR_WATCH.path).write_text(textwrap.dedent(floor_file(1)), encoding="utf-8")
        findings = evaluate(measure(self.repo, [FLOOR_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "floor-lowered")
        self.assertIn("BELOW", findings[0].message)
        self.assertIn("20", findings[0].message)

    def test_a_floor_lowered_and_committed_still_fails(self):
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "add floor")
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(0), "relax the reason length")
        findings = evaluate(measure(self.repo, [FLOOR_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "floor-lowered")

    def test_a_floor_walked_down_in_small_steps_fails(self):
        for value in (20, 15, 10, 5):
            write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(value), f"nudge to {value}")
        findings = evaluate(measure(self.repo, [FLOOR_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertIn("20", findings[0].message)

    def test_raising_a_floor_passes_and_becomes_the_new_bound(self):
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "add floor")
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(40), "demand more of a reason")
        measurement = measure(self.repo, [FLOOR_WATCH])
        self.assertEqual(evaluate(measurement), [])
        self.assertEqual(measurement.readings[0].bound, 40.0)

    def test_a_floor_raised_then_dropped_back_to_the_old_level_fails(self):
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "add floor")
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(40), "demand more")
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "put it back")
        findings = evaluate(measure(self.repo, [FLOOR_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertIn("40", findings[0].message)

    def test_the_same_history_read_as_a_cap_would_pass(self):
        # The asymmetry is the declared direction and nothing else. This is the
        # test that would have stayed green through the whole defect: the
        # numbers are identical, only `direction` differs.
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "add floor")
        (self.repo / FLOOR_WATCH.path).write_text(textwrap.dedent(floor_file(1)), encoding="utf-8")
        as_a_cap = Watch(
            path=FLOOR_WATCH.path,
            kind=FLOOR_WATCH.kind,
            locator=FLOOR_WATCH.locator,
            why=FLOOR_WATCH.why,
            direction=DOWN,
        )
        self.assertEqual(evaluate(measure(self.repo, [as_a_cap])), [])
        self.assertEqual(len(evaluate(measure(self.repo, [FLOOR_WATCH]))), 1)

    def test_an_unknown_direction_raises(self):
        write_and_commit(self.repo, FLOOR_WATCH.path, floor_file(20), "add floor")
        sideways = Watch(
            path=FLOOR_WATCH.path,
            kind=FLOOR_WATCH.kind,
            locator=FLOOR_WATCH.locator,
            why=FLOOR_WATCH.why,
            direction="either",
        )
        with self.assertRaises(CapError) as caught:
            measure(self.repo, [sideways])
        self.assertIn("direction", str(caught.exception))


class RenamedFileTests(unittest.TestCase):
    """`git mv` used to reset a floor to whatever the value was that day."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        init_repo(self.repo)

    def rename(self, old: str, new: str) -> None:
        git(self.repo, "mv", old, new)
        git(self.repo, "commit", "--quiet", "-m", "chore: move the control")

    def test_a_rename_does_not_reset_the_floor(self):
        write_and_commit(self.repo, "scripts/ci/old_thing.py", constant_file(150), "add cap")
        self.rename("scripts/ci/old_thing.py", CONST_WATCH.path)
        (self.repo / CONST_WATCH.path).write_text(
            textwrap.dedent(constant_file(400)), encoding="utf-8"
        )
        findings = evaluate(measure(self.repo, [CONST_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "cap-raised")
        self.assertIn("150", findings[0].message)

    def test_the_report_says_the_history_crossed_a_rename(self):
        write_and_commit(self.repo, "scripts/ci/old_thing.py", constant_file(150), "add cap")
        self.rename("scripts/ci/old_thing.py", CONST_WATCH.path)
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertTrue(
            any("old_thing.py" in note for note in measurement.notes),
            f"the rename is not visible in the report: {measurement.notes}",
        )

    def test_a_floor_survives_a_rename_too(self):
        write_and_commit(self.repo, "scripts/ci/old_thing.py", floor_file(40), "add floor")
        self.rename("scripts/ci/old_thing.py", FLOOR_WATCH.path)
        (self.repo / FLOOR_WATCH.path).write_text(textwrap.dedent(floor_file(1)), encoding="utf-8")
        findings = evaluate(measure(self.repo, [FLOOR_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "floor-lowered")

    def test_a_lowering_a_merge_discarded_is_still_in_the_history(self):
        # Two ways of reading history that both looked reasonable and are both
        # narrower than the truth. `--follow` linearises and drops every merge
        # (7 of `cap_ratchet.py`'s 10 default revisions, 30 under
        # `--full-history`); the *default* walk hides any commit TREESAME to a
        # parent, which is what this fixture builds: a branch lowers the cap to
        # 90, a `-s ours` merge discards it, and a plain `git log -- path` then
        # shows only the 150. The walk reads `--full-history` so the 90 counts,
        # because the rule is the lowest value the file has ever held in
        # committed history, and it held 90.
        #
        # The cost is deliberate: an abandoned branch that lowered a cap pins
        # the floor at what it lowered it to. The remedy is to lower the cap for
        # real, which this control has never refused.
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "add cap")
        git(self.repo, "checkout", "--quiet", "-b", "side")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(90), "lower on a branch")
        git(self.repo, "checkout", "--quiet", "main")
        write_and_commit(self.repo, "README.md", "unrelated\n", "unrelated work")
        git(self.repo, "merge", "--quiet", "-s", "ours", "--no-ff", "-m", "keep ours", "side")
        plain = git(self.repo, "log", "--format=%H", "--", CONST_WATCH.path).split()
        self.assertEqual(
            len(plain), 1, "the fixture no longer hides the lowering, so it proves nothing"
        )
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(measurement.readings[0].bound, 90.0)
        self.assertEqual(len(evaluate(measurement)), 1)


class EvidenceWindowTests(unittest.TestCase):
    """`MAX_REVISIONS` is the number every floor above is measured from.

    The audit's proof was: lower it 500 -> 4 under an innocuous subject, add a
    few commits, and every floor is re-measured from a window in which nothing
    has been raised yet. Truncation printed a NOTE, which failed nothing.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        init_repo(self.repo)
        self._window = cap_ratchet.MAX_REVISIONS
        self.addCleanup(setattr, cap_ratchet, "MAX_REVISIONS", self._window)

    def test_a_truncated_walk_fails_rather_than_measuring_from_a_window(self):
        for value in (150, 140, 130):
            write_and_commit(self.repo, CONST_WATCH.path, constant_file(value), f"set {value}")
        cap_ratchet.MAX_REVISIONS = 1
        with self.assertRaises(CapError) as caught:
            measure(self.repo, [CONST_WATCH])
        self.assertIn("window", str(caught.exception))
        self.assertIn("MAX_REVISIONS", str(caught.exception))

    def test_shrinking_the_window_cannot_buy_a_higher_floor(self):
        # The audit's move, in miniature: the floor is 100, the value on disk is
        # 150, and a one-revision window would call that "at floor".
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(100), "add cap")
        write_and_commit(self.repo, CONST_WATCH.path, constant_file(150), "raise it")
        self.assertEqual(len(evaluate(measure(self.repo, [CONST_WATCH]))), 1)
        cap_ratchet.MAX_REVISIONS = 1
        with self.assertRaises(CapError):
            measure(self.repo, [CONST_WATCH])

    def test_a_window_that_exactly_covers_the_history_is_not_truncated(self):
        for value in (150, 140):
            write_and_commit(self.repo, CONST_WATCH.path, constant_file(value), f"set {value}")
        cap_ratchet.MAX_REVISIONS = 2
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertEqual(measurement.readings[0].bound, 140.0)

    def test_the_cli_reports_the_truncation_as_a_failure(self):
        for value in (150, 140, 130):
            write_and_commit(self.repo, CONST_WATCH.path, constant_file(value), f"set {value}")
        cap_ratchet.MAX_REVISIONS = 1
        original = cap_ratchet.WATCHES
        cap_ratchet.WATCHES = (CONST_WATCH,)
        try:
            self.assertEqual(cap_ratchet.main(["--repo-root", str(self.repo)]), 1)
        finally:
            cap_ratchet.WATCHES = original


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

    def test_every_bound_constant_in_the_ci_scripts_is_watched(self):
        """The contract that stops this control from watching nothing.

        Any module-level constant in `scripts/ci/` named `MAX_*`, `CAP_*`,
        `LIMIT_*`, `MIN_*`, `FLOOR_*` or `THRESHOLD_*` bounds something by
        construction — that is what the prefix means in this repository — and a
        change can weaken it in one direction or the other. Adding one without
        adding it to WATCHES creates a bound nothing holds, which is the hole
        this whole file exists to close.

        Two things were wrong with this until 2026-08-05, both found by the
        control audit and both proven end to end:

        * it skipped `cap_ratchet.py` itself, so `MAX_REVISIONS` — the history
          window every floor in the tower is measured from — was the one number
          nothing watched, and lowering it was always legal;
        * it matched only a plain `ast.Assign` of an `ast.Constant` named
          `MAX_*`, so `MAX_X: int = 9999`, `MAX_X = BASE * 4` and `CAP_X = 9999`
          each declared a ceiling it could not see.
        """
        watched = {(w.path, w.locator) for w in WATCHES if w.kind == "python-constant"}
        missing = []
        unreadable = []
        for script in sorted((REPO_ROOT / "scripts" / "ci").glob("*.py")):
            rel = str(script.relative_to(REPO_ROOT))
            for const in declared_bound_constants(script.read_text(encoding="utf-8")):
                if const.value is None:
                    # Declared as an expression, an annotation with no value, or
                    # bound twice. The ratchet cannot hold a number it cannot
                    # read, and "cannot read" must not be reported as "absent".
                    unreadable.append(f"{rel}:{const.name} (line {const.lineno})")
                elif (rel, const.name) not in watched:
                    missing.append(f"{rel}:{const.name}")
        self.assertEqual(
            unreadable,
            [],
            "These are declared in a form this ratchet cannot reduce to a number, so it "
            "cannot hold them. Declare each as a plain numeric literal: "
            + ", ".join(unreadable),
        )
        self.assertEqual(
            missing,
            [],
            "These bound something and nothing stops them being weakened. "
            "Add them to WATCHES in scripts/ci/cap_ratchet.py: " + ", ".join(missing),
        )

    def test_this_controls_own_evidence_window_is_watched_and_only_upward(self):
        """A2 from the control audit, stated as a test.

        `MAX_REVISIONS` is the window every floor above is measured from, so
        watching it is not optional — and the direction is up, because a larger
        window can only lower a cap's floor and raise a safety floor's ceiling.
        Shrinking it re-measures the whole tower from a window in which nothing
        has been raised yet.
        """
        by_key = {(w.path, w.locator): w for w in WATCHES}
        key = ("scripts/ci/cap_ratchet.py", "MAX_REVISIONS")
        self.assertIn(
            key,
            by_key,
            "the history window every other floor is computed from is unwatched; "
            "that was the state the 2026-08-04 audit exploited",
        )
        self.assertEqual(
            by_key[key].direction,
            UP,
            "lowering the evidence window is the weakening direction, so it is watched upward",
        )

    def test_the_evidence_window_still_covers_every_watched_files_history(self):
        """Measured from git, not from the module's own history.

        The point of taking this reading here is that it does not read
        `MAX_REVISIONS`'s past — the part an attacker with enough commits could
        out-wait — it reads how much history exists today. If the window no
        longer covers a watched file, `measure` fails closed on truncation, and
        this says so before CI does.
        """
        deepest = []
        for path in sorted({w.path for w in WATCHES}):
            revisions = subprocess.run(
                ["git", "log", "--full-history", "--format=%H", "--", path],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=True,
            ).stdout.split()
            deepest.append((len(revisions), path))
        deepest.sort(reverse=True)
        count, path = deepest[0]
        self.assertGreaterEqual(
            cap_ratchet.MAX_REVISIONS,
            count,
            f"{path} has {count} revisions and the walk stops at "
            f"{cap_ratchet.MAX_REVISIONS}, so its floor would come from part of its history. "
            f"Raise MAX_REVISIONS — that is the strict direction and the ratchet permits it.",
        )

    def test_every_watch_moves_in_the_direction_its_name_declares(self):
        """A direction field nobody checks is a way to un-ratchet a cap.

        Flipping a `MAX_*` watch to `direction=UP` would let it be raised
        forever while still appearing in WATCHES and in the report. The name
        decides, and the single inversion is registered above with its reason.
        """
        for watch in WATCHES:
            with self.subTest(watch=f"{watch.path}:{watch.locator}"):
                leaf = watch.locator.rsplit(".", 1)[-1]
                if watch.kind == "python-constant":
                    expected = DOWN if leaf.startswith(PREFIXES_MEANING_CEILING) else UP
                else:
                    expected = UP if leaf.startswith("min_") else DOWN
                if (watch.path, watch.locator) in INVERTED_DIRECTIONS:
                    expected = UP if expected == DOWN else DOWN
                self.assertEqual(
                    watch.direction,
                    expected,
                    f"{watch.locator} is named as a {'ceiling' if expected == DOWN else 'floor'} "
                    f"but is watched as the opposite. Either the name or the direction is wrong; "
                    f"a deliberate inversion goes in INVERTED_DIRECTIONS in this file, with the "
                    f"argument for it.",
                )

    def test_the_registered_direction_inversions_are_still_real_watches(self):
        # An inversion that outlives its watch is a hole waiting for a constant
        # of the same name to be added back without review.
        keys = {(w.path, w.locator) for w in WATCHES}
        stale = sorted(f"{p}:{n}" for p, n in INVERTED_DIRECTIONS if (p, n) not in keys)
        self.assertEqual(stale, [], "inversions for watches that no longer exist: " + ", ".join(stale))

    def test_every_yaml_budget_key_is_watched_or_registered_as_exempt(self):
        """The mirror of the constants contract, for the declared budgets.

        The test above covers `python-constant` watches only, which is why
        eight numeric keys under `budget:` in `platform/*.yaml` sat unwatched:
        raising `max_unshipped_age_days` 7 -> 30, `max_without_build_path`
        5 -> 6 and `slack` 0 -> 4 all measured PASS. A number under `budget:`
        is a declared ceiling by construction — that is what the key means in
        this repository — so each one is either held to its historical floor or
        named in `UNWATCHED_BUDGET_KEYS` with the reason it is not.
        """
        watched = {(w.path, w.locator) for w in WATCHES if w.kind == "yaml-path"}
        exempt = {(e.path, e.locator) for e in UNWATCHED_BUDGET_KEYS}

        missing = []
        for rel in platform_budget_files():
            path = REPO_ROOT / rel
            if not path.is_file():
                continue
            for dotted in numeric_budget_leaves(path.read_text(encoding="utf-8")):
                if (rel, dotted) not in watched and (rel, dotted) not in exempt:
                    missing.append(f"{rel}:{dotted}")

        self.assertEqual(
            missing,
            [],
            "These declared budgets can be raised and nothing would say so. Add a "
            "yaml-path Watch to WATCHES in scripts/ci/cap_ratchet.py, or, if the number "
            "genuinely must be free to rise, a BudgetExemption to UNWATCHED_BUDGET_KEYS "
            "carrying the reason: " + ", ".join(missing),
        )

    def test_every_exemption_still_names_a_real_budget_number(self):
        # An exemption that outlives the key it excuses is a register nobody
        # reads, and it silently widens the contract above: the pair would sit
        # in `exempt` forever, ready to absorb a key of the same name added back
        # later without review.
        stale = []
        for exemption in UNWATCHED_BUDGET_KEYS:
            path = REPO_ROOT / exemption.path
            if not path.is_file():
                stale.append(f"{exemption.path} does not exist")
                continue
            source = path.read_text(encoding="utf-8")
            if exemption.locator not in numeric_budget_leaves(source):
                stale.append(f"{exemption.path}:{exemption.locator} is not a numeric budget key")
        self.assertEqual(stale, [], "stale exemptions: " + ", ".join(stale))

    def test_no_key_is_both_watched_and_exempt(self):
        watched = {(w.path, w.locator) for w in WATCHES if w.kind == "yaml-path"}
        both = sorted(
            f"{e.path}:{e.locator}" for e in UNWATCHED_BUDGET_KEYS if (e.path, e.locator) in watched
        )
        self.assertEqual(both, [], "watched and excused at once: " + ", ".join(both))

    def test_every_exemption_is_one_key_and_carries_a_written_reason(self):
        # A blanket exemption — a directory, a whole file, a wildcard — is a
        # region where "every declared budget is ratcheted" may be untrue, and
        # reads as coverage from outside. Each is earned per key, with prose
        # long enough to be an argument rather than a label.
        seen = set()
        for exemption in UNWATCHED_BUDGET_KEYS:
            with self.subTest(exemption=f"{exemption.path}:{exemption.locator}"):
                self.assertTrue(
                    exemption.path.startswith("platform/") and exemption.path.endswith(".yaml"),
                    "an exemption names one file",
                )
                self.assertNotIn("*", exemption.path)
                self.assertNotIn("*", exemption.locator)
                self.assertTrue(
                    exemption.locator.startswith("budget.") and exemption.locator != "budget.",
                    "an exemption names one key under `budget:`, not the mapping",
                )
                self.assertGreater(len(exemption.why), 80, "the reason has to be a reason")
                key = (exemption.path, exemption.locator)
                self.assertNotIn(key, seen, "declared twice")
                seen.add(key)

    def test_no_watch_is_declared_twice(self):
        keys = [(w.path, w.kind, w.locator) for w in WATCHES]
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_watch_explains_what_the_number_is(self):
        for watch in WATCHES:
            with self.subTest(watch=watch.locator):
                self.assertGreater(len(watch.why), 20)


if __name__ == "__main__":
    unittest.main()
