#!/usr/bin/env python3
"""
Refuse a real-repository gate that excuses itself.

`release_lag.py` and `branch_collisions.py` both state, in prose, that their CLI
is *not* the gate — the pytest contract test is. Both also state that an
unverified baseline is a failure and that the one thing it may not do is fall
through to the local ref in silence. Those two facts together mean that a branch
inside a `TestRealRepository` method **is** the whole control for whatever state
it names, and that changing one requires touching no line of the module it is
exercising. Nothing but a reader could notice.

Three such branches have now been added, each in a commit named after other
work:

  * `except CollisionError: return` in the collision-budget gate. Any refusal,
    including one caused by a doctored baseline, passed the gate silently. Fixed
    — and the fix's own comment records it.
  * `if "unreachable" in str(exc): return`, added next to that comment, which
    reintroduced a narrower version of the same hole.
  * `findings = [f for f in findings if f.check != "baseline-unverified"]` in the
    release-lag gate, followed two lines later by `assertEqual([], findings)`.
    Delete the finding, then assert there were none. On every offline run, which
    is precisely when a delivery claim is least supportable.

So the shape is the recurring defect, not any one instance, and this file is a
source contract over the shape. It parses the two gate modules rather than
running them, because the states it cares about — an unreachable remote, a
doctored ref — cannot be arranged in the real repository on demand, and a test
that arranges them in a scratch repository would pass while the real gate
excused itself. `tests/test_release_lag.py::TestBaselineTrust` already proves
the *behaviour* against a real bare remote; this proves the gate still consults
it.

Reads. Executes nothing.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parents[1]

#: The gates this contract covers, with the method that is the real-repository
#: assertion in each. Listed explicitly: a glob over `tests/` would silently
#: stop covering a gate that was renamed, and being wrong here is invisible.
GATES = (
    ("tests/test_release_lag.py", "test_this_repository_is_within_its_declared_budget"),
    ("tests/test_branch_collisions.py", "test_it_runs_or_refuses_against_this_repository"),
    ("tests/test_branch_collisions.py", "test_the_baseline_is_verified_against_the_remote"),
    ("tests/test_branch_collisions.py", "test_this_repository_is_within_the_collision_budget"),
)

#: Findings a gate must never remove from its own evidence before judging it.
BASELINE_CHECKS = ("baseline-unverified", "baseline-forged")


def _source(relative: str) -> str:
    return (REPO_ROOT / relative).read_text()


def _method(relative: str, name: str) -> ast.FunctionDef:
    for node in ast.walk(ast.parse(_source(relative))):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise AssertionError(
        f"{relative} has no method {name}. If a gate was renamed, update GATES in "
        f"{Path(__file__).name} — a contract that cannot find its subject is not a passing contract."
    )


def _asserts_in(body: List[ast.stmt]) -> List[str]:
    """Names of `self.assert*` calls and bare `assert` statements in `body`."""
    found: List[str] = []
    for statement in body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Assert):
                found.append("assert")
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr.startswith("assert"):
                    found.append(node.func.attr)
    return found


def _mentions_unverified_state(test: ast.expr) -> bool:
    """Does this `if` test turn on a baseline state that is not `verified`?

    Matched on the state names rather than on `trust.state`, so it catches both
    `trust.state == STATE_UNREACHABLE` and `"unreachable" in str(exc)` — the two
    forms the excuse has actually taken.
    """
    for node in ast.walk(test):
        if isinstance(node, ast.Name) and node.id.startswith("STATE_") and node.id != "STATE_VERIFIED":
            return True
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node.value in {"unreachable", "diverged", "missing-on-remote", "not-a-remote-ref"}:
                return True
    return False


class GateSelfExcuseTest(unittest.TestCase):
    def test_every_declared_gate_exists(self):
        # Vacuity guard. Every assertion below iterates GATES, so a GATES that
        # resolved to nothing would make this whole file green over no subject.
        #
        # The count is pinned because the list is hand-maintained and the first
        # draft of it was short. Mutating one gate's `return` proved nothing,
        # because that gate was the one I had not listed — a control whose
        # subject list is a guess, which is the sibling defect to the one this
        # file exists to catch. Adding a real-repository gate means adding it
        # here, and this assertion is what says so.
        self.assertEqual(4, len(GATES))
        for relative, name in GATES:
            self.assertTrue((REPO_ROOT / relative).is_file(), relative)
            _method(relative, name)

    def test_no_gate_filters_a_baseline_finding_out_of_its_own_evidence(self):
        # Parsed, not grepped, and scoped to the gate methods. The first draft of
        # this test scanned the file for the literal source text and failed on
        # the comment recording the defect and on its own definition — a control
        # reading a surface it guessed at, which is the other recurring shape in
        # this repository. A `!=` against a check id is in the AST; a comment
        # about one is not.
        for relative, name in GATES:
            method = _method(relative, name)
            for node in ast.walk(method):
                if not isinstance(node, ast.Compare):
                    continue
                if not any(isinstance(op, ast.NotEq) for op in node.ops):
                    continue
                for operand in [node.left, *node.comparators]:
                    if isinstance(operand, ast.Constant) and operand.value in BASELINE_CHECKS:
                        self.fail(
                            f"{relative}::{name} line {node.lineno} excludes the "
                            f"{operand.value!r} finding from its own evidence. An unverifiable "
                            f"baseline is a refusal, not an empty findings list — assert the "
                            f"finding is present instead of removing it."
                        )

    def test_the_release_lag_gate_binds_its_findings_exactly_once(self):
        # The measured shape of the defect: `findings` was rebound to a filtered
        # copy between `evaluate()` and `assertEqual([], findings)`. One binding
        # means the list judged is the list measured.
        relative, name = GATES[0]
        method = _method(relative, name)
        rebinds = [
            target.id
            for node in ast.walk(method)
            if isinstance(node, ast.Assign)
            for target in node.targets
            if isinstance(target, ast.Name) and target.id == "findings"
        ]
        self.assertEqual(
            1,
            len(rebinds),
            f"{relative}::{name} binds `findings` {len(rebinds)} times. The gate must judge the "
            f"findings it measured; rebinding it is how a check gets dropped without touching the "
            f"module that produced it.",
        )

    def test_a_branch_on_an_unverified_baseline_asserts_something(self):
        # `if trust.state == STATE_UNREACHABLE: return` asserts nothing at all —
        # not even that the control noticed. A gate may decline to judge a
        # budget it has no evidence for; it may not decline to judge anything.
        for relative, name in GATES:
            method = _method(relative, name)
            for node in ast.walk(method):
                if not isinstance(node, ast.If) or not _mentions_unverified_state(node.test):
                    continue
                self.assertTrue(
                    _asserts_in(node.body),
                    f"{relative}::{name} line {node.lineno}: this branch turns on a baseline state "
                    f"that is not `verified` and asserts nothing. Assert the refusal — that the "
                    f"state is not counted as verified and does produce a finding — then return.",
                )

    def test_an_except_branch_that_returns_still_proves_the_refusal(self):
        # The `except BaselineUnverified: ... return` form is acceptable *because*
        # reaching the handler proves the control raised. This pins that: the
        # handler must be for a refusal type, not a bare `except`.
        for relative, name in GATES:
            method = _method(relative, name)
            for node in ast.walk(method):
                if not isinstance(node, ast.ExceptHandler):
                    continue
                self.assertIsNotNone(
                    node.type,
                    f"{relative}::{name} line {node.lineno}: a bare `except` in a real-repository "
                    f"gate swallows the refusal it exists to report.",
                )


if __name__ == "__main__":
    unittest.main()
