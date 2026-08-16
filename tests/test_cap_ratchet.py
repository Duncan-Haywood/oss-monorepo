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

import re
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
from cap_ratchet import (
    PINS,
    UNENROLLED_VENTURE_CONSTANTS,
    VENTURE_PREDICATES,
    Pin,
    declared_ts_bound_constants,
    evaluate_pins,
    extract_ts_constant,
    fold_ts_number,
    holders_of,
    money_named_venture_constants,
    source_literal_pins_declaration,
    ts_module_constants,
    venture_ts_sources,
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


def _numeric_leaves(node, prefix: str, leaves: list) -> None:
    """Collect dotted paths of every numeric (non-bool) leaf under `node`."""
    if isinstance(node, dict):
        for key, value in node.items():
            _numeric_leaves(value, f"{prefix}.{key}" if prefix else str(key), leaves)
    elif isinstance(node, bool):
        return
    elif isinstance(node, (int, float)):
        leaves.append(prefix)


def _is_bound_shaped(dotted: str) -> bool:
    """Does this key's own name declare it to be a ceiling or a floor?

    `max_unshipped_commits`, `semgrep_unparsed_max`, `min_retention_factor`.
    Not `count`, `version`, `port` — those are quantities, not bounds, and
    sweeping them in would make the contract so noisy that the honest response
    to it would be a blanket exemption. This repository has already been bitten
    by an exemption that covered a whole directory; the enumeration has to stay
    narrow enough that every entry is worth arguing one at a time.
    """
    leaf = dotted.rsplit(".", 1)[-1]
    return (
        leaf.startswith(("max_", "min_"))
        or leaf.endswith(("_max", "_min"))
        or leaf in ("max", "min")
    )


def numeric_budget_leaves(source: str) -> list:
    """Every declared bound in a `platform/*.yaml`, dotted.

    Two sources, and the second one is here because the first was a guess.

    Everything under a top-level `budget:` mapping, because a file that
    declares a budget means every number in it as a budget — including ones
    whose names say nothing, like `slack`.

    Plus any `max_*`/`*_max`/`min_*`/`*_min` key anywhere else in the document.
    That half was missing until 2026-08-08 and it cost a real control: the SAST
    parse-coverage ceiling lives at `coverage.semgrep_unparsed_max` in
    `platform/sast-baseline.yaml`, a file with no `budget:` mapping at all, so
    this contract enumerated nothing for it and passed. The number was raised
    49 -> 53 on 2026-08-05 and nothing said so. The contract had been reading
    a guessed surface — the top-level key name — rather than the shape of the
    number it exists to find.
    """
    try:
        data = yaml.safe_load(source)
    except yaml.YAMLError:
        return []
    if not isinstance(data, dict):
        return []

    leaves: list = []
    if isinstance(data.get("budget"), dict):
        _numeric_leaves(data["budget"], "budget", leaves)

    elsewhere: list = []
    for key, value in data.items():
        if key == "budget":
            continue
        _numeric_leaves(value, str(key), elsewhere)
    leaves.extend(dotted for dotted in elsewhere if _is_bound_shaped(dotted))
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

    def rename(self, old: str, new: str, body: str = None) -> None:
        """Move the file, and — the part that matters — change it in the same commit.

        A rename committed on its own leaves the old value present under the
        new name, so the floor survives even with rename-following removed:
        the first version of these tests passed with the fix mutated out, which
        is the whole reason mutation-testing them was not optional. The move
        and the raise land together here, the way `git mv` plus an edit does in
        one ordinary commit.
        """
        git(self.repo, "mv", old, new)
        if body is not None:
            (self.repo / new).write_text(textwrap.dedent(body), encoding="utf-8")
            git(self.repo, "add", new)
        git(self.repo, "commit", "--quiet", "-m", "refactor: give the control a clearer name")

    def test_a_rename_does_not_reset_the_floor(self):
        write_and_commit(self.repo, "scripts/ci/old_thing.py", constant_file(150), "add cap")
        self.rename("scripts/ci/old_thing.py", CONST_WATCH.path, constant_file(400))
        findings = evaluate(measure(self.repo, [CONST_WATCH]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].check, "cap-raised")
        self.assertIn("150", findings[0].message)

    def test_no_revision_under_the_new_name_holds_the_old_value(self):
        # The fixture's own premise: without the rename chain there is nothing
        # left to measure against, which is exactly why the raise used to pass.
        write_and_commit(self.repo, "scripts/ci/old_thing.py", constant_file(150), "add cap")
        self.rename("scripts/ci/old_thing.py", CONST_WATCH.path, constant_file(400))
        under_new_name = git(self.repo, "log", "--format=%H", "--", CONST_WATCH.path).split()
        self.assertEqual(len(under_new_name), 1, "the fixture proves nothing")
        blob = git(self.repo, "show", f"{under_new_name[0]}:{CONST_WATCH.path}")
        self.assertIn("400", blob)
        self.assertNotIn("150", blob)

    def test_the_report_says_the_history_crossed_a_rename(self):
        write_and_commit(self.repo, "scripts/ci/old_thing.py", constant_file(150), "add cap")
        self.rename("scripts/ci/old_thing.py", CONST_WATCH.path, constant_file(400))
        measurement = measure(self.repo, [CONST_WATCH])
        self.assertTrue(
            any("old_thing.py" in note for note in measurement.notes),
            f"the rename is not visible in the report: {measurement.notes}",
        )

    def test_a_floor_survives_a_rename_too(self):
        write_and_commit(self.repo, "scripts/ci/old_thing.py", floor_file(40), "add floor")
        self.rename("scripts/ci/old_thing.py", FLOOR_WATCH.path, floor_file(1))
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
                # Constants are SHOUT_CASE in both Python and TypeScript, so
                # both read their direction from the same prefix list. YAML keys
                # are lowercase and read from `min_`. Before `ts-constant`
                # existed this branched on "python or not", which would have
                # silently expected DOWN for every TypeScript floor.
                if watch.kind in ("python-constant", "ts-constant"):
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

    def test_a_bound_outside_a_budget_mapping_is_enumerated(self):
        """The hole that hid `coverage.semgrep_unparsed_max` for two days.

        `platform/sast-baseline.yaml` has no `budget:` mapping, so an
        enumeration keyed on that name returned nothing for it and the contract
        above passed vacuously over the file. Meanwhile the ceiling inside it
        went 49 -> 53 unremarked. The document below is that file's shape,
        reduced: a ceiling and a list under a top-level key called something
        else, next to numbers that are quantities rather than bounds.
        """
        source = (
            "coverage:\n"
            "  semgrep_unparsed_max: 52\n"
            "  semgrep_unparsed:\n"
            "    - a/b.tsx\n"
            "baseline:\n"
            "  - id: SAST-001\n"
            "    count: 31\n"
        )
        leaves = numeric_budget_leaves(source)
        self.assertIn(
            "coverage.semgrep_unparsed_max",
            leaves,
            "a `*_max` ceiling outside a `budget:` mapping must still be enumerated, "
            "or it can be raised and nothing would say so",
        )
        # And not the quantities beside it. Sweeping every number in would make
        # the contract noisy enough that the honest response is a blanket
        # exemption, which is the failure mode one level down.
        self.assertNotIn("baseline.0.count", leaves)
        self.assertEqual(
            [leaf for leaf in leaves if not _is_bound_shaped(leaf)],
            [],
            "only bound-shaped keys are enumerated outside `budget:`",
        )

    def test_budget_mapping_numbers_are_still_enumerated_whatever_they_are_called(self):
        # The other half: under `budget:` the file has declared that every
        # number in it is a budget, so `slack` counts even though its name
        # says nothing. Broadening the search outside `budget:` must not
        # narrow it inside.
        leaves = numeric_budget_leaves("budget:\n  slack: 4\n  max_thing: 12\n")
        self.assertEqual(sorted(leaves), ["budget.max_thing", "budget.slack"])

    def test_sast_parse_coverage_ceiling_is_watched_downward(self):
        """`coverage.semgrep_unparsed_max` is a cap, and is held to its floor.

        Named explicitly rather than left to the enumeration above, because
        this is the one number whose weakening this repository has already
        performed: every file on `coverage.semgrep_unparsed` is scanned only up
        to the construct semgrep cannot parse, so raising the ceiling buys a
        green SAST job by giving back scanning coverage.
        """
        matching = [
            w
            for w in WATCHES
            if w.path == "platform/sast-baseline.yaml"
            and w.locator == "coverage.semgrep_unparsed_max"
        ]
        self.assertEqual(len(matching), 1, "the SAST parse-coverage ceiling must be watched once")
        self.assertEqual(matching[0].kind, "yaml-path")
        self.assertEqual(
            matching[0].direction,
            "down",
            "it is a debt ceiling: it may fall forever and may never rise",
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
                    "." in exemption.locator and not exemption.locator.endswith("."),
                    "an exemption names one dotted key, not a mapping",
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


class TypeScriptReaderTests(unittest.TestCase):
    """The reader that made `ventures/` reachable at all.

    Held to the same standard as the Python reader above: it never executes the
    source, it refuses anything it cannot resolve to a single number, and
    "refuses" means None, which every caller turns into a failure.
    """

    def test_reads_a_plain_constant(self):
        self.assertEqual(extract_ts_constant("const MAX_X = 12;\n", "MAX_X"), 12)

    def test_reads_an_exported_constant(self):
        self.assertEqual(extract_ts_constant("export const MAX_X = 12;\n", "MAX_X"), 12)

    def test_reads_a_typed_constant(self):
        self.assertEqual(extract_ts_constant("export const MAX_X: number = 12;\n", "MAX_X"), 12)

    def test_reads_numeric_separators(self):
        self.assertEqual(extract_ts_constant("const MAX_X = 1_000_000_00;\n", "MAX_X"), 100000000)

    def test_folds_pure_arithmetic(self):
        # `30 * 24 * 60 * 60 * 1000` names a unit conversion. Forcing it to be
        # retyped as a magic number to satisfy the reader would be the control
        # making the code worse in order to measure it.
        self.assertEqual(
            extract_ts_constant("export const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;\n", "MAX_SNOOZE_MS"),
            2592000000,
        )

    def test_an_expression_naming_another_constant_is_unreadable(self):
        # The Python side's rule: you cannot launder a bound through
        # `MAX_X = BASE * 4`, because then the number that binds is elsewhere.
        self.assertIsNone(extract_ts_constant("const MAX_X = BASE * 4;\n", "MAX_X"))

    def test_an_object_literal_is_unreadable(self):
        self.assertIsNone(
            extract_ts_constant("export const MAX_LENGTH = { title: 80 } as const;\n", "MAX_LENGTH")
        )

    def test_a_string_is_not_a_number(self):
        self.assertIsNone(extract_ts_constant('const MAX_X = "12";\n', "MAX_X"))

    def test_a_constant_inside_a_function_is_not_module_level(self):
        source = "function f() {\n  const MAX_X = 12;\n}\n"
        self.assertIsNone(extract_ts_constant(source, "MAX_X"))

    def test_a_constant_declared_twice_is_unreadable_rather_than_its_first_value(self):
        # Same rule as the Python reader. `MAX_X = 5` then `MAX_X = 9999` is not
        # a cap of 5, and reading it as one is worse than refusing to read it.
        source = "const MAX_X = 5;\nconst MAX_X = 9999;\n"
        self.assertIsNone(extract_ts_constant(source, "MAX_X"))

    def test_absent_constant_is_none(self):
        self.assertIsNone(extract_ts_constant("const OTHER = 1;\n", "MAX_X"))

    def test_a_comment_is_not_folded_as_integer_division(self):
        # `//` means a comment in TypeScript and integer division in Python.
        # Resolving it as either would be a guess.
        self.assertIsNone(fold_ts_number("12 // a comment"))

    def test_the_module_is_never_executed_to_read_it(self):
        # There is no TypeScript runtime here, but the shape matters: the reader
        # must not shell out or import. A source that would throw if run still
        # reads fine.
        source = "throw new Error('boom');\nexport const MAX_X = 7;\n"
        self.assertEqual(extract_ts_constant(source, "MAX_X"), 7)

    def test_bound_named_constants_are_enumerated_with_their_direction(self):
        source = "export const MAX_A = 1;\nconst MIN_B = 2;\nconst OTHER = 3;\n"
        found = {c.name: c.expected_direction for c in declared_ts_bound_constants(source)}
        self.assertEqual(found, {"MAX_A": DOWN, "MIN_B": UP})
        # `OTHER` is still a constant, just not one whose name bounds anything.
        self.assertIn("OTHER", ts_module_constants(source))


class PinBehaviourTests(unittest.TestCase):
    """A pin has to fail in three separate ways, and each is tested here.

    Checking only the value would have called this venture healthy while the
    artist split was copied to a fourteenth site computing it from a different
    base. The count is as load-bearing as the number.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def _write(self, rel, text):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(text), encoding="utf-8")

    def test_a_pinned_constant_at_its_declared_value_passes(self):
        self._write("a.ts", "export const MAX_X = 300;\n")
        pin = Pin(path="a.ts", kind="ts-constant", locator="MAX_X", value=300, why="a bound")
        self.assertEqual(evaluate_pins(self.root, [pin]), [])

    def test_a_pinned_constant_that_changed_fails(self):
        self._write("a.ts", "export const MAX_X = 900;\n")
        pin = Pin(path="a.ts", kind="ts-constant", locator="MAX_X", value=300, why="a bound")
        findings = evaluate_pins(self.root, [pin])
        self.assertEqual([f.check for f in findings], ["pin-changed"])

    def test_lowering_a_pinned_constant_also_fails(self):
        # Deliberately not a ratchet. For a number whose correct value is a
        # business decision, both directions are a decision, and the control's
        # job is to make the decision visible rather than to permit one side.
        self._write("a.ts", "export const MAX_X = 10;\n")
        pin = Pin(path="a.ts", kind="ts-constant", locator="MAX_X", value=300, why="a bound")
        self.assertEqual([f.check for f in evaluate_pins(self.root, [pin])], ["pin-changed"])

    def test_a_deleted_pinned_constant_fails_rather_than_passing(self):
        self._write("a.ts", "export const SOMETHING_ELSE = 300;\n")
        pin = Pin(path="a.ts", kind="ts-constant", locator="MAX_X", value=300, why="a bound")
        self.assertEqual([f.check for f in evaluate_pins(self.root, [pin])], ["pin-unreadable"])

    def test_a_missing_pinned_file_fails_rather_than_passing(self):
        pin = Pin(path="gone.ts", kind="ts-constant", locator="MAX_X", value=300, why="a bound")
        self.assertEqual([f.check for f in evaluate_pins(self.root, [pin])], ["pin-file-missing"])

    def test_an_unknown_pin_kind_fails(self):
        self._write("a.ts", "const x = 1;\n")
        pin = Pin(path="a.ts", kind="invented", locator="MAX_X", value=1, why="a bound")
        self.assertEqual([f.check for f in evaluate_pins(self.root, [pin])], ["pin-unknown-kind"])

    def test_a_source_literal_at_its_declared_value_passes(self):
        self._write("m.ts", "const artistShare = round(netProfit * 0.3);\n")
        pin = Pin(
            path="m.ts",
            kind="source-literal",
            locator=r"netProfit \* ([0-9.]+)",
            value=0.3,
            why="the artist split",
        )
        self.assertEqual(evaluate_pins(self.root, [pin]), [])

    def test_a_changed_money_literal_fails(self):
        self._write("m.ts", "const artistShare = round(netProfit * 0.25);\n")
        pin = Pin(
            path="m.ts",
            kind="source-literal",
            locator=r"netProfit \* ([0-9.]+)",
            value=0.3,
            why="the artist split",
        )
        findings = evaluate_pins(self.root, [pin])
        self.assertEqual([f.check for f in findings], ["pin-changed"])
        self.assertIn("0.25", findings[0].message)

    def test_a_deleted_money_literal_fails(self):
        self._write("m.ts", "const artistShare = round(netProfit * rate);\n")
        pin = Pin(
            path="m.ts",
            kind="source-literal",
            locator=r"netProfit \* ([0-9.]+)",
            value=0.3,
            why="the artist split",
        )
        findings = evaluate_pins(self.root, [pin])
        self.assertEqual([f.check for f in findings], ["pin-anchor-moved"])
        self.assertIn("deleted or rewritten", findings[0].message)

    def test_a_money_literal_copied_to_a_new_site_fails(self):
        # The defect this venture actually has: the same split re-typed at a new
        # site, correct on the day it was written and free to drift after.
        self._write(
            "m.ts",
            """\
            const artistShare = round(netProfit * 0.3);
            const otherShare = round(netProfit * 0.3);
            """,
        )
        pin = Pin(
            path="m.ts",
            kind="source-literal",
            locator=r"netProfit \* ([0-9.]+)",
            value=0.3,
            why="the artist split",
        )
        findings = evaluate_pins(self.root, [pin])
        self.assertEqual([f.check for f in findings], ["pin-anchor-moved"])
        self.assertIn("copied to a new site", findings[0].message)

    def test_a_declared_multi_site_pin_holds_every_site(self):
        # Two occurrences are declared, so two is correct — but both must carry
        # the pinned value, or the sites have drifted apart.
        self._write(
            "m.ts",
            """\
            const a = netProfit * 0.3;
            const b = netProfit * 0.4;
            """,
        )
        pin = Pin(
            path="m.ts",
            kind="source-literal",
            locator=r"netProfit \* ([0-9.]+)",
            value=0.3,
            why="the artist split",
            occurrences=2,
        )
        findings = evaluate_pins(self.root, [pin])
        self.assertEqual([f.check for f in findings], ["pin-changed"])


class LiteralCensusTests(unittest.TestCase):
    """The check that catches a copy the anchored pins cannot see.

    Written because mutation-testing the anchored pins found them green against
    the mutation that matters most: copying `netProfit * 0.3` to a line with a
    different variable name does not match an anchor keyed on
    `const artistShare = ...`, and renaming as it goes is exactly what each of
    this venture's fourteen existing copies did.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def _pin(self, count):
        return Pin(
            path="m.ts",
            kind="literal-census",
            locator=r"(?<![0-9.])0\.(?:3|30|7|70)(?![0-9])",
            value=count,
            why="how many times this file re-types the split",
        )

    def _write(self, text):
        (self.root / "m.ts").write_text(textwrap.dedent(text), encoding="utf-8")

    def test_the_declared_number_of_occurrences_passes(self):
        self._write("const a = netProfit * 0.3;\nconst b = netProfit * 0.7;\n")
        self.assertEqual(evaluate_pins(self.root, [self._pin(2)]), [])

    def test_a_copy_under_a_different_name_fails(self):
        self._write(
            """\
            const a = netProfit * 0.3;
            const b = netProfit * 0.7;
            const sneaky = grossProfit * 0.3;
            """
        )
        findings = evaluate_pins(self.root, [self._pin(2)])
        self.assertEqual([f.check for f in findings], ["pin-census-changed"])
        self.assertIn("no pin", findings[0].message)

    def test_a_removed_occurrence_also_fails(self):
        self._write("const a = netProfit * 0.3;\n")
        findings = evaluate_pins(self.root, [self._pin(2)])
        self.assertEqual([f.check for f in findings], ["pin-census-changed"])

    def test_comments_are_not_counted(self):
        # Otherwise the census depends on how well the split is documented, and
        # falls the moment someone improves a comment about it.
        self._write(
            """\
            // the artist takes 0.3 and the platform keeps 0.7
            /* historically this was 0.3 too */
            const a = netProfit * 0.3;
            """
        )
        self.assertEqual(evaluate_pins(self.root, [self._pin(1)]), [])

    def test_stripping_comments_preserves_line_structure(self):
        # A multi-line block comment must not collapse the lines around it, or
        # every line number this control reports afterwards is wrong.
        source = "a\n/* x\ny */\nb\n"
        stripped = cap_ratchet.strip_ts_comments(source)
        self.assertEqual(stripped.count("\n"), source.count("\n"))
        self.assertNotIn("x", stripped)
        self.assertIn("b", stripped)

    def test_a_longer_decimal_is_not_miscounted(self):
        # `0.35` is the AI compute cost and `0.03` the payment fee rate; both
        # sit beside the split in these files and neither is it.
        self._write("const a = cost * 0.35;\nconst b = fee * 0.03;\nconst c = netProfit * 0.3;\n")
        self.assertEqual(evaluate_pins(self.root, [self._pin(1)]), [])


class VentureEnrollmentContractTests(unittest.TestCase):
    """Watched, pinned, or registered — over the live repository.

    The naive version of this change would have been a `.ts` glob matching
    `MAX_*`/`MIN_*` identifiers, and it would have missed everything that
    mattered. The Stripe replay window is called
    `STRIPE_WEBHOOK_MAX_AGE_SECONDS`, so no `MAX_`-prefix rule reaches it; the
    artist payout split has no name at all. A bigger regex is not the control.
    The contract is: enumerate the population mechanically, and refuse to let a
    member of it be neither held nor argued about.
    """

    def test_every_bound_named_venture_constant_is_watched_pinned_or_registered(self):
        watched = {(w.path, w.locator) for w in WATCHES if w.kind == "ts-constant"}
        pinned = {(p.path, p.locator) for p in PINS if p.kind == "ts-constant"}
        exempt = {(e.path, e.locator) for e in UNENROLLED_VENTURE_CONSTANTS}

        missing = []
        unreadable = []
        for rel in venture_ts_sources(REPO_ROOT):
            source = (REPO_ROOT / rel).read_text(encoding="utf-8")
            for const in declared_ts_bound_constants(source):
                key = (rel, const.name)
                if key in watched or key in pinned or key in exempt:
                    continue
                if const.value is None:
                    unreadable.append(f"{rel}:{const.name} (line {const.lineno})")
                else:
                    missing.append(f"{rel}:{const.name}")

        self.assertEqual(
            unreadable,
            [],
            "These name a bound but do not resolve to one number, so nothing can hold them. "
            "Declare each as a plain numeric literal, or register it in "
            "UNENROLLED_VENTURE_CONSTANTS with a predicate: " + ", ".join(unreadable),
        )
        self.assertEqual(
            missing,
            [],
            "These bound something in a venture and nothing holds them. Add each to WATCHES "
            "(if one direction is unambiguously the weak one), to PINS (if any change should be "
            "a visible decision), or to UNENROLLED_VENTURE_CONSTANTS with a predicate: "
            + ", ".join(missing),
        )

    def test_every_money_named_venture_constant_is_held(self):
        """The fee, payout and withholding path, enumerated rather than listed.

        Its sibling above holds every constant whose name starts `MAX_`, `MIN_`
        or `THRESHOLD_`, and reports 100% coverage while seeing none of
        `STRIPE_RATE`, `US_BACKUP_WITHHOLDING_RATE` or
        `DEFAULT_CHARGEBACK_RESERVE_RATE`. A prefix rule cannot reach the money
        path, because money constants are not named after bounds.

        The literal census this sits beside is the other half of the same hole
        and is curated by hand: ten print-atelier files declare how many bare
        split literals they contain, and nothing fails when an eleventh money
        file appears, because the list simply does not mention it. This
        population is derived from `git ls-files` on every run, so a new money
        constant is enrolled by existing.
        """
        unheld = [
            f"{path}:{name}"
            for path, name in money_named_venture_constants(REPO_ROOT)
            if not holders_of(path, name)
        ]
        self.assertEqual(
            unheld,
            [],
            "These name something on the money path and nothing holds them, so any value "
            "change is invisible. Add each to PINS (if a change should be a visible decision) "
            "or to UNENROLLED_VENTURE_CONSTANTS with a predicate (if it holds no single "
            "number): " + ", ".join(unheld),
        )

    def test_the_money_enumeration_actually_finds_something(self):
        """A derived population that collapses to nothing is a passing gate.

        This repository has shipped a vacuous glob before. The floor is set
        below the population at the time of writing so ordinary deletions do
        not trip it, and far above zero so a broken enumeration does.
        """
        population = money_named_venture_constants(REPO_ROOT)
        self.assertGreater(
            len(population), 15, "the money-named constant enumeration collapsed"
        )
        self.assertTrue(
            any("print-atelier" in path for path, _ in population),
            "the enumeration no longer reaches the venture that takes payments",
        )

    def test_no_money_named_constant_is_held_twice(self):
        """A constant both pinned and excused is a register disagreeing with itself.

        `holders_of` deliberately recognises a `source-literal` pin anchored on
        a constant's declaration as holding it — `stripe-connect.ts`'s
        `STRIPE_FIXED` is held that way. Without that, the contract above would
        demand a second pin for it and this test is what stops the pair being
        added.
        """
        for path, name in money_named_venture_constants(REPO_ROOT):
            with self.subTest(constant=f"{path}:{name}"):
                self.assertLessEqual(
                    len(holders_of(path, name)),
                    1,
                    f"{path}:{name} is held {len(holders_of(path, name))} times",
                )

    def test_a_source_literal_pin_only_holds_what_it_declares(self):
        """Mentioning a constant is not pinning it.

        The test above lets a `source-literal` pin count as a holder. That
        concession is only sound while "holder" means *anchored on the
        declaration*. A locator anchored on a line that merely uses the
        constant — `total \\* STRIPE_RATE \\+ STRIPE_FIXED` is exactly such a
        line, at `checkout.ts:484` — captures a number somewhere else entirely,
        so accepting it would let the enrollment contract report full coverage
        over a declaration nothing pins. That is the same shape as a control
        reading a guessed surface, and it is cheap to refuse here.
        """
        usage = r"const stripeProcessingFee = roundCurrency\(total \* STRIPE_RATE \+ STRIPE_FIXED\)"
        for name in ("STRIPE_RATE", "STRIPE_FIXED"):
            with self.subTest(name=name):
                self.assertIn(name, usage, "the fixture stopped naming the constant")
                self.assertFalse(
                    source_literal_pins_declaration(usage, name),
                    f"a locator anchored on a *use* of {name} was counted as pinning it",
                )

        # The real pin this concession exists for must keep working, or the
        # refusal above is bought by re-opening the hole it was added to close.
        declaration = r"^const STRIPE_FIXED = ([0-9.]+);$"
        self.assertTrue(source_literal_pins_declaration(declaration, "STRIPE_FIXED"))
        self.assertEqual(
            holders_of("ventures/print-atelier/src/lib/stripe-connect.ts", "STRIPE_FIXED"),
            ["pin"],
            "stripe-connect.ts's declaration-anchored STRIPE_FIXED pin stopped being seen",
        )

    def test_the_enumeration_actually_finds_something(self):
        """A contract over an empty population is a contract over nothing.

        `venture_ts_sources` reads `git ls-files`, and the failure mode that
        matters is it returning nothing — a vacuous glob is a passing gate, and
        this repository has shipped one before.
        """
        sources = venture_ts_sources(REPO_ROOT)
        self.assertGreater(len(sources), 100, "the venture source enumeration collapsed")
        found = 0
        for rel in sources:
            found += len(declared_ts_bound_constants((REPO_ROOT / rel).read_text(encoding="utf-8")))
        self.assertGreater(found, 20, "the bound-constant enumeration collapsed")

    def test_the_enumeration_skips_dependencies_and_build_output(self):
        for rel in venture_ts_sources(REPO_ROOT):
            self.assertNotIn("node_modules", rel)
            self.assertNotIn("/dist/", rel)

    def test_removing_any_one_registration_leaves_its_constant_unheld(self):
        """Each entry is individually load-bearing.

        The register could otherwise grow entries that hold nothing, which reads
        as coverage and provides none.
        """
        registered = (
            [("watch", w.path, w.locator) for w in WATCHES if w.kind == "ts-constant"]
            + [("pin", p.path, p.locator) for p in PINS if p.kind == "ts-constant"]
            + [("exempt", e.path, e.locator) for e in UNENROLLED_VENTURE_CONSTANTS]
        )
        self.assertGreater(len(registered), 0)

        # Every module-level constant, not only the bound-named ones. A pin may
        # legitimately hold a constant the name-based enumeration cannot see —
        # `STRIPE_WEBHOOK_MAX_AGE_SECONDS` is the reason this register exists at
        # all, and no `MAX_`-prefix rule reaches it. What must not happen is an
        # entry naming a constant that is no longer there.
        live = set()
        for rel in venture_ts_sources(REPO_ROOT):
            source = (REPO_ROOT / rel).read_text(encoding="utf-8")
            for name in ts_module_constants(source):
                live.add((rel, name))

        for kind, path, locator in registered:
            with self.subTest(entry=f"{kind} {path}:{locator}"):
                self.assertIn(
                    (path, locator),
                    live,
                    f"{path}:{locator} is registered as a {kind} but is not a module-level "
                    f"constant there any more, so the entry holds nothing",
                )

    def test_no_venture_constant_is_held_twice(self):
        keys = (
            [(w.path, w.locator) for w in WATCHES if w.kind == "ts-constant"]
            + [(p.path, p.locator) for p in PINS if p.kind == "ts-constant"]
            + [(e.path, e.locator) for e in UNENROLLED_VENTURE_CONSTANTS]
        )
        duplicates = sorted({k for k in keys if keys.count(k) > 1})
        self.assertEqual(
            duplicates,
            [],
            "a constant that is both held and excused is a register that disagrees with itself",
        )

    def test_every_exemption_carries_a_registered_predicate_that_still_holds(self):
        """The reason is data a test re-runs, not a sentence nobody rechecks.

        A required-but-unread field drifts: this repository has already had a
        register entry whose stated reason had gone false while every count
        stayed green.
        """
        for exemption in UNENROLLED_VENTURE_CONSTANTS:
            with self.subTest(exemption=f"{exemption.path}:{exemption.locator}"):
                self.assertIn(
                    exemption.predicate,
                    VENTURE_PREDICATES,
                    "an exemption must name a predicate that exists",
                )
                broken = VENTURE_PREDICATES[exemption.predicate](
                    REPO_ROOT, exemption.path, exemption.locator
                )
                self.assertIsNone(
                    broken,
                    f"the reason this exemption rests on no longer holds: {broken}",
                )

    def test_every_registered_predicate_is_used(self):
        used = {e.predicate for e in UNENROLLED_VENTURE_CONSTANTS}
        self.assertEqual(
            sorted(used),
            sorted(VENTURE_PREDICATES),
            "an unused predicate is a check nobody is subject to",
        )

    def test_every_exemption_is_one_constant_and_argues_its_case(self):
        seen = set()
        for exemption in UNENROLLED_VENTURE_CONSTANTS:
            with self.subTest(exemption=exemption.locator):
                self.assertTrue(exemption.path.startswith("ventures/"))
                self.assertNotIn("*", exemption.path)
                self.assertNotIn("*", exemption.locator)
                # Earned one constant at a time. A directory-level exemption is
                # a region where "every load-bearing number is held" may quietly
                # be untrue, which is the shape this repository's claims controls
                # have already been bitten by.
                self.assertGreater(
                    len(exemption.why), 200, "the reason has to argue the case, not label it"
                )
                key = (exemption.path, exemption.locator)
                self.assertNotIn(key, seen, "declared twice")
                seen.add(key)


class PinRegisterContractTests(unittest.TestCase):
    """Contracts over PINS itself, over the live repository."""

    def test_every_pin_resolves_and_holds_today(self):
        self.assertEqual(
            [f.message for f in evaluate_pins(REPO_ROOT)],
            [],
            "a pin that does not resolve is a number nobody is guarding",
        )

    def test_no_pin_is_declared_twice(self):
        keys = [(p.path, p.kind, p.locator) for p in PINS]
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_pin_explains_what_the_number_is(self):
        for pin in PINS:
            with self.subTest(pin=f"{pin.path}:{pin.locator}"):
                self.assertGreater(len(pin.why), 20)

    def test_every_pin_names_a_venture_file(self):
        # The ratchet above governs `scripts/ci` and `platform`. Pins exist for
        # the numbers those kinds cannot reach, and pinning a repo control here
        # would be a way to swap a ratchet for a weaker check.
        for pin in PINS:
            with self.subTest(pin=pin.path):
                self.assertTrue(pin.path.startswith("ventures/"))

    def test_every_source_literal_pin_captures_exactly_one_number(self):
        for pin in PINS:
            if pin.kind != "source-literal":
                continue
            with self.subTest(pin=f"{pin.path}:{pin.locator}"):
                self.assertEqual(
                    re.compile(pin.locator).groups,
                    1,
                    "a source-literal anchor holds exactly one capture group, the number",
                )
                self.assertGreaterEqual(pin.occurrences, 1)

    def test_the_artist_payout_split_is_held_on_every_path_that_pays(self):
        """The named half of the assignment behind this register.

        Not a restatement of `PINS` — this asserts that the specific files that
        move money for an artist each carry a pin, so deleting one from the
        register is a failure here rather than a silent narrowing.
        """
        pays_an_artist = {
            "ventures/print-atelier/src/lib/marketplace.ts",
            "ventures/print-atelier/src/lib/stripe-connect.ts",
            "ventures/print-atelier/src/lib/pod-routing-optimizer.ts",
            "ventures/print-atelier/src/lib/global-pricing.ts",
            "ventures/print-atelier/src/lib/artist-terms.ts",
        }
        held = {p.path for p in PINS if p.kind == "source-literal" and p.value in (0.3, 0.7)}
        self.assertEqual(
            sorted(pays_an_artist - held),
            [],
            "these compute an artist payout from a bare 0.3/0.7 and carry no pin",
        )


if __name__ == "__main__":
    unittest.main()
