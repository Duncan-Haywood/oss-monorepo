#!/usr/bin/env python3
"""
Cap ratchet — the ratchet over the ratchets.

Every declared budget in this repository is bounded by a number one level up.
`platform/release-lag-budget.yaml` may declare `max_unshipped_commits`, but not
above `MAX_DECLARED_UNSHIPPED_COMMITS` in `scripts/ci/release_lag.py`.
`platform/kill-criteria-baseline.yaml` may declare `max_without_stopping_rule`,
but not above `MAX_DECLARED_WITHOUT_STOPPING_RULE` in
`scripts/ci/kill_criteria_ratchet.py`. Each of those caps carries a comment
saying that raising it "requires changing this file under review, which is the
point."

Nothing reviewed it. The caps landed on 2026-08-02 in `cc3ff45` — "cap the two
release-lag budget values that could be argued up forever" — and by the next
day the working tree held:

    -MAX_DECLARED_UNSHIPPED_COMMITS = 150
    -MAX_DECLARED_BRANCHES = 40
    +MAX_DECLARED_UNSHIPPED_COMMITS = 170
    +MAX_DECLARED_BRANCHES = 45

alongside `max_unshipped_commits: 135 -> 165` and `max_branches_ahead: 35 -> 45`
in the YAML the cap exists to bound. The measured pile was 171 commits, so the
gate failed anyway; the tell that this was widening rather than re-declaring is
that the prose above the constants still read "deliberately close to the
2026-08-02 measurement (127 commits, 31 branches)" and "allow roughly one more
session of growth". A cap is not a cap if the thing it caps can edit it.

So this control ratchets the caps themselves, and it takes its floor from git
rather than from another declared number — because another declared number is
just one more thing to raise. For each watched value:

    fail when the value on disk is above the lowest value it has ever held
    in this file's committed history.

That is the ratchet property stated exactly once, at the top of the tower.
Lowering a cap is always allowed and immediately becomes the new floor. Raising
one is refused, and the refusal cannot be cleared by editing YAML, by editing
the enforcing script, or by adding commits — only by making the underlying
number genuinely smaller, which for the release-lag budget means shipping.

Both directions, because half the numbers here are the other kind
------------------------------------------------------------------
A cap (`MAX_*`, `CAP_*`) is a ceiling on debt: it may fall forever and may
never rise. A floor (`MIN_*`) is a safety minimum — how many words a human must
write before a SAST finding may be suppressed, how many characters an owner
must write to overrule a fired stopping rule. Lowering one of those is a
weakening in exactly the same way raising a cap is, and until 2026-08-05 this
control could not see it: `evaluate` only fired on `current > floor`, so every
`MIN_*` in `scripts/ci/` sat outside the ratchet. Each watch now declares the
direction it may move in, and the bound it is held to is the historical minimum
for a cap and the historical maximum for a floor. The name says which:
`tests/test_cap_ratchet.py` derives the expected direction from the prefix and
refuses a watch whose declared direction disagrees with its name.

Why the evidence window is itself watched, and upward
-----------------------------------------------------
`MAX_REVISIONS` below bounds the history walk, so it is the number every floor
in this tower is computed from. The 2026-08-04 control audit demonstrated the
consequence end to end: lower it 500 -> 4 under an innocuous subject, add a few
commits, and every floor is re-measured from a four-revision window in which
nothing has been raised yet — `PASS: 27 caps` with the whole suite green.

Two things hold it now, and deliberately not one:

1. It is watched like everything else, in the *rising* direction. A larger
   window can only ever produce a lower cap floor and a higher safety-floor
   ceiling, so raising it is the strengthening move and is always allowed;
   lowering it is refused. That check reads this file's own history, which is
   the part an attacker with enough commits could out-wait.
2. A truncated history walk is now a **failure**, not the `NOTE` it used to
   print. This is the check that does not depend on reading `MAX_REVISIONS`'s
   own past: shrinking the window to forge a floor makes every watched file
   with more revisions than the new window fail loudly, and this file is one of
   them. The only way out is to raise the window, which (1) permits.

   The cost is real and intended: when a watched file genuinely accumulates
   more revisions than the window, this gate goes red until someone raises
   `MAX_REVISIONS`. That is a raise of a number that only makes the control
   stricter, reviewed in a diff, which is the trade the audit asked for.

Neither check is *independent* of this module — within one file and its test
that is not achievable, and no fully external watcher exists yet. What exists
is a second check that reads git rather than this file's history, plus a
contract in `tests/test_cap_ratchet.py` that measures every watched file's real
revision count today and fails if the window no longer covers it.

Why git history and not the previous commit: comparing against `HEAD` lets a
value walk upward five at a time across a session, each step legal against the
one before it. Comparing against the historical minimum makes the walk
impossible regardless of how it is spread across commits. Rewriting history to
defeat this is possible and is visible as a force-push, which is a different
control's problem.

Why not compare against `origin/main`: on 2026-08-03 most of these files did
not exist at `origin/main` at all — 171 commits of the delivery pile stood
between them. A baseline that is absent for the files it governs governs
nothing.

Deliberately fails closed. A missing file, a missing constant, a non-numeric
value, or an unreadable history is a failure, not a skip. That is the specific
way this repository's gates have been found to lie: a missing input reported
PASSED for work it never did.

What it does not do: it does not decide whether any budget is *right*. A cap
that was always too generous stays too generous — this only refuses to let it
grow. Tightening one is the portfolio owner's call, and doing so needs no
permission from this file.

Usage:
    python3 scripts/ci/cap_ratchet.py              # audit, exit 1 on failure
    python3 scripts/ci/cap_ratchet.py --report     # measure, always exit 0
    python3 scripts/ci/cap_ratchet.py --json       # machine-readable
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import yaml

# How far back to walk a file's history. The bound exists so a long-lived
# repository cannot turn this check into a git-storm.
#
# This is the evidence window every floor in this file is measured from, so it
# is watched in `WATCHES` below in the RISING direction: raising it can only
# make a cap floor lower and a safety-floor ceiling higher, i.e. stricter;
# lowering it re-measures the whole tower from a shorter window in which
# nothing has been raised yet. Truncating the walk is a failure rather than the
# NOTE it used to be, so shrinking this number does not quietly buy a lower
# floor — it makes every file with more history than the window fail.
MAX_REVISIONS = 500

# The direction a watched number is allowed to move in.
DOWN = "down"  # a cap: may fall forever, may never rise
UP = "up"  # a floor: may rise forever, may never fall
DIRECTIONS = (DOWN, UP)


@dataclass(frozen=True)
class Watch:
    """A number that may only ever move in one direction.

    `direction=DOWN` is a cap held to the lowest value it has ever held.
    `direction=UP` is a safety floor held to the highest value it has ever
    held — lowering one of those is a weakening, and is refused symmetrically.
    """

    path: str
    kind: str  # "python-constant" | "yaml-path"
    locator: str
    why: str
    direction: str = DOWN


# Every cap that bounds a declared budget elsewhere in the repository, plus the
# declared budgets that are themselves pure debt counters. A ceiling on debt is
# only meaningful while it is falling.
#
# Not watched: `platform/coverage-baseline.yaml` component baselines. Those are
# floors that are *supposed* to rise as coverage improves, and the two-
# directional check in `scripts/ci/coverage_ratchet.py` already refuses a drop.
# Watching them here would forbid the improvement the ratchet exists to force.
#
# Every numeric leaf under a top-level `budget:` mapping in `platform/*.yaml`
# must be either watched below or registered in `UNWATCHED_BUDGET_KEYS` with a
# reason. `tests/test_cap_ratchet.py` enforces that, the way the sibling
# contract enforces it for `MAX_*` constants — eight YAML keys drifted unwatched
# for two days because only the constants had a contract, and a budget number
# nobody watches is indistinguishable from no budget.
WATCHES: Tuple[Watch, ...] = (
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_UNSHIPPED_COMMITS",
        why="the ceiling on how large the undelivered pile may be declared to be",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_BRANCHES",
        why="the ceiling on how many branches may be declared to hold undelivered work",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_AGE_DAYS",
        why="the ceiling on how long finished work may sit undelivered",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the widest gap allowed between the measured lag and the declared budget",
    ),
    Watch(
        path="scripts/ci/kill_criteria_ratchet.py",
        kind="python-constant",
        locator="MAX_DECLARED_WITHOUT_STOPPING_RULE",
        why="the ceiling on how many ventures may draw budget with no brake",
    ),
    Watch(
        path="scripts/ci/kill_criteria_ratchet.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the widest gap allowed between the measured count and the declared ceiling",
    ),
    Watch(
        path="scripts/ci/coverage_ratchet.py",
        kind="python-constant",
        locator="MAX_TOLERANCE_POINTS",
        why="the coverage band that needs no review, which is not permission to regress",
    ),
    Watch(
        path="scripts/ci/branch_collisions.py",
        kind="python-constant",
        locator="MAX_COLLIDING_PATHS",
        why="the ceiling on how many files two live branches may be building twice",
    ),
    # The expiry horizons. These bound how long any suppression may be parked
    # before someone re-reads it, so raising one is a way to stop re-reading
    # everything at once. They are ceilings on debt like the rest.
    Watch(
        path="scripts/ci/audit_exceptions.py",
        kind="python-constant",
        locator="MAX_HORIZON_DAYS",
        why="the furthest out a registered exception may be parked before review",
    ),
    Watch(
        path="scripts/ci/release_lag.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the release-lag budget may be parked before review",
    ),
    Watch(
        path="scripts/ci/kill_criteria_ratchet.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the stopping-rule baseline may be parked before review",
    ),
    # Arrived with the 2026-08-03 integration, from four branches that each
    # added a cap without knowing this ratchet existed. The contract test below
    # is what found them, which is the argument for it being a test rather than
    # a convention: a cap nobody watches is indistinguishable from no cap.
    Watch(
        path="scripts/ci/image_tags.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out a mutable-image-tag exemption may be parked before review",
    ),
    Watch(
        path="scripts/ci/route_posture_contract.py",
        kind="python-constant",
        locator="MAX_EXEMPTION_DAYS",
        why="the furthest out a venture may serve routes with no contract running in CI",
    ),
    Watch(
        path="scripts/ci/sast_scan.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out a SAST finding may be suppressed before review",
    ),
    Watch(
        path="scripts/ci/sast_scan.py",
        kind="python-constant",
        locator="MAX_SHADOWED_FILES",
        why=(
            "the ceiling on how many semgrep-shadowed files may be handed back as "
            "explicit scanning roots. Over it the scan refuses rather than "
            "truncating, so this bounds the size of a surface the scanner would "
            "otherwise cover only in part while still reporting a clean result"
        ),
    ),
    Watch(
        path="scripts/ci/coverage_ratchet.py",
        kind="python-constant",
        locator="MAX_BASIS_DRIFT_PERCENT",
        why="how far a coverage basis may move before the measurement is re-read",
    ),
    # Same story, one branch later: `stopping_rule_review.py` landed with two
    # caps of its own, and the contract test below caught them within the hour.
    Watch(
        path="scripts/ci/stopping_rule_review.py",
        kind="python-constant",
        locator="MAX_CONTINUE_OVERRIDES",
        why="how many fired stopping rules the owner may overrule before it is the standing answer",
    ),
    Watch(
        path="scripts/ci/stopping_rule_review.py",
        kind="python-constant",
        locator="MAX_REVIEW_DAYS",
        why="how long a `continue` may stand over a fired brake before it is re-argued",
    ),
    # `integration_debt.py`, 2026-08-04. Registered in the same commit that
    # added it rather than by a later contract test noticing — which is the
    # habit the four entries above exist to enforce.
    Watch(
        path="scripts/ci/integration_debt.py",
        kind="python-constant",
        locator="MAX_DECLARED_TIPS",
        why="the ceiling on how many separate piles undelivered work may sit in",
    ),
    Watch(
        path="scripts/ci/integration_debt.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the widest gap allowed between the measured tip count and the declared ceiling",
    ),
    Watch(
        path="scripts/ci/integration_debt.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the integration-debt budget may be parked before review",
    ),
    # `image_release_path.py`, 2026-08-04, arriving on a branch that did not
    # have this ratchet. The contract test caught all four on the merge, which
    # is the third time it has done so — the pattern is not a lapse by any one
    # author, it is what happens when a control and a cap are written on
    # branches that cannot see each other.
    #
    # The first two are the ones that matter. They are pure debt counters
    # measured before the control existed: six images with no producer, seven
    # resolving to a mutable tag. Every venture that acquires a build path
    # lowers the first, and local-site-studio already took it to five. Nothing
    # should ever be able to argue either back up.
    Watch(
        path="scripts/ci/image_release_path.py",
        kind="python-constant",
        locator="MAX_DECLARED_WITHOUT_BUILD_PATH",
        why="the ceiling on how many deployments may name an image nothing builds",
    ),
    Watch(
        path="scripts/ci/image_release_path.py",
        kind="python-constant",
        locator="MAX_DECLARED_MUTABLE_REFERENCES",
        why="the ceiling on how many releases may be pinned to a tag that can move",
    ),
    Watch(
        path="scripts/ci/image_release_path.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the widest gap allowed between the measured images and the declared ceiling",
    ),
    Watch(
        path="scripts/ci/image_release_path.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the image-release baseline may be parked before review",
    ),
    Watch(
        path="platform/release-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_unshipped_commits",
        why="the size of the undelivered pile; only shipping lowers it",
    ),
    Watch(
        path="platform/release-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_branches_ahead",
        why="the number of branches holding undelivered work",
    ),
    Watch(
        path="platform/kill-criteria-baseline.yaml",
        kind="yaml-path",
        locator="budget.max_without_stopping_rule",
        why="the number of ventures that can draw budget forever",
    ),
    # 2026-08-04. The three above were the only YAML this ratchet held, and the
    # control audit found the other eight budget keys open: raising
    # `max_unshipped_age_days` 7 -> 30, `max_without_build_path` 5 -> 6 and
    # `slack` 0 -> 4 together still measured `PASS: 27 caps`.
    #
    # Every `slack*` key is pure widening room by construction. Slack is the
    # distance a measurement may fall below its ceiling before the ceiling is
    # called stale, so raising one is exactly the move that stops a budget being
    # re-declared after the work that would lower it has already happened. That
    # is the stale direction of every two-directional check here, disarmed
    # without touching the ceiling it guards.
    Watch(
        path="platform/release-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.slack_commits",
        why="the room the undelivered-pile budget may be stale by before it must be lowered",
    ),
    Watch(
        path="platform/release-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_unshipped_age_days",
        why="the lead time finished work may sit undelivered; only shipping lowers it",
    ),
    Watch(
        path="platform/image-release-baseline.yaml",
        kind="yaml-path",
        locator="budget.max_without_build_path",
        why="the number of deployments naming an image nothing in this repository builds",
    ),
    Watch(
        path="platform/image-release-baseline.yaml",
        kind="yaml-path",
        locator="budget.max_mutable_references",
        why="the number of releases pinned to a tag that can move under them",
    ),
    Watch(
        path="platform/image-release-baseline.yaml",
        kind="yaml-path",
        locator="budget.slack",
        why="the room the image-release ceilings may be stale by before they must be lowered",
    ),
    Watch(
        path="platform/integration-debt-budget.yaml",
        kind="yaml-path",
        locator="budget.slack_tips",
        why="the room the tip ceiling may be stale by before it must be re-declared",
    ),
    Watch(
        path="platform/kill-criteria-baseline.yaml",
        kind="yaml-path",
        locator="budget.slack",
        why="the room the stopping-rule ceiling may be stale by before it must be lowered",
    ),
    # 2026-08-05, from the control audit's A2. The contract test used to skip
    # this file when enumerating watched constants, so the one number every
    # floor above is computed from was the only one nothing watched. Watched
    # upward: see the module docstring for why a bigger window is the strict
    # direction, and why truncation is now a failure rather than a note.
    Watch(
        path="scripts/ci/cap_ratchet.py",
        kind="python-constant",
        locator="MAX_REVISIONS",
        why=(
            "the evidence window every floor in this file is measured from; shrinking it "
            "re-measures the whole tower from a window in which nothing has been raised yet"
        ),
        direction=UP,
    ),
    # The safety floors. Same audit, same commit: `evaluate` only fired on
    # `current > floor`, so a `MIN_*` moving DOWN — the weakening direction for
    # a minimum — was invisible to this control even where it was watched.
    Watch(
        path="scripts/ci/sast_scan.py",
        kind="python-constant",
        locator="MIN_REVIEWED_REASON_WORDS",
        why=(
            "the least a human must write before a SAST finding is suppressed as reviewed; "
            "lowering it is how a review becomes a word"
        ),
        direction=UP,
    ),
    Watch(
        path="scripts/ci/stopping_rule_review.py",
        kind="python-constant",
        locator="MIN_REASON_CHARS",
        why=(
            "the least an owner must write to overrule a fired stopping rule; lowering it is "
            "how an override becomes a shrug"
        ),
        direction=UP,
    ),
    # 2026-08-05, with `scripts/ci/deployment_lag.py`. The sibling
    # release-lag budget measures the distance from a developer to `origin/main`;
    # this one measures the distance from `origin/main` to a customer, and every
    # dimension of it is pure debt. `max_unrecorded_deployments` in particular is
    # the count of public hostnames nothing in this repository can identify —
    # raising it is how a branded surface serving a debug page becomes normal.
    Watch(
        path="platform/deployment-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_commits_behind",
        why="how far behind origin/main the deployed code may be; only promoting lowers it",
    ),
    Watch(
        path="platform/deployment-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_unrecorded_deployments",
        why="the number of public hostnames served by something this repository cannot identify",
    ),
    Watch(
        path="platform/deployment-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.max_deployed_age_days",
        why="lead time to the customer; no amount of new work lowers it, only promoting does",
    ),
    Watch(
        path="platform/deployment-lag-budget.yaml",
        kind="yaml-path",
        locator="budget.slack_commits",
        why="the room the deployment budgets may be stale by before they must be lowered",
    ),
    Watch(
        path="scripts/ci/deployment_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_COMMITS_BEHIND",
        why="the ceiling on how far behind a deployment may be declared to be",
    ),
    Watch(
        path="scripts/ci/deployment_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_UNRECORDED",
        why="the ceiling on how many public hostnames may be declared untraceable",
    ),
    Watch(
        path="scripts/ci/deployment_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_AGE_DAYS",
        why="the ceiling on how old the deployed revision may be declared to be",
    ),
    Watch(
        path="scripts/ci/deployment_lag.py",
        kind="python-constant",
        locator="MAX_DECLARED_SLACK",
        why="the ceiling on the deployment budgets' staleness room",
    ),
    Watch(
        path="scripts/ci/deployment_lag.py",
        kind="python-constant",
        locator="MAX_EXPIRY_DAYS",
        why="the furthest out the deployment-lag budget may be parked before review",
    ),
    Watch(
        path="scripts/ci/gate_wiring.py",
        kind="python-constant",
        locator="MAX_UNWIRED_CONTROLS",
        why=(
            "the ceiling on how many controls may sit registered as executed-by-nothing. "
            "Raising it is how the register turns back into the state it was built to end"
        ),
    ),
    Watch(
        path="scripts/ci/gate_wiring.py",
        kind="python-constant",
        locator="MAX_REGISTRATION_DAYS",
        why="the furthest out an unwired control may be parked before its reason is argued again",
    ),
)


@dataclass(frozen=True)
class BudgetExemption:
    """A numeric budget key deliberately left unwatched, and the reason why.

    Earned one key at a time. A file- or directory-level exemption would be a
    region in which the claim "every declared budget is ratcheted" may quietly
    be untrue, and this repository has already been bitten by that exact shape
    in its claims controls. The reason is data a test reads, not a comment
    nothing enforces: `tests/test_cap_ratchet.py` requires every entry here to
    still resolve to a real number, so an exemption cannot outlive the key it
    excuses.
    """

    path: str
    locator: str
    why: str


UNWATCHED_BUDGET_KEYS: Tuple[BudgetExemption, ...] = (
    BudgetExemption(
        path="platform/integration-debt-budget.yaml",
        locator="budget.max_unintegrated_tips",
        why=(
            "not a pure debt counter. The three caps above it in "
            "`scripts/ci/integration_debt.py` are watched, which is what stops it being "
            "widened indefinitely. `budget.max_unshipped_commits` only shipping lowers, "
            "whereas the tip count rises whenever concurrent sessions branch and falls "
            "when someone integrates, both of them normal working state. Locking it to "
            "its historical minimum would mean the first quiet day set a ceiling that "
            "ordinary parallel work could never clear except by merging under a red "
            "gate, and a gate that fails on ordinary work is one that gets widened. "
            "`budget.slack_tips` beside it is watched, so the stale direction is held."
        ),
    ),
    BudgetExemption(
        path="platform/VENTURE.template.yaml",
        locator="budget.monthly_cap",
        why=(
            "an example value in the file that is copied to start a venture, not a "
            "number that binds anything. The caps that bind live in "
            "`ventures/<name>/VENTURE.yaml`, which this enumeration does not reach, so "
            "ratcheting the template would hold the sample to its historical minimum "
            "while every real cap stayed free — coverage in appearance only, which is "
            "the defect this ratchet exists to refuse. What a venture may spend is the "
            "portfolio owner's call, measured against `portfolio/ledger/` by "
            "`scripts/ci/kill_criteria_ratchet.py` and `scripts/ci/stopping_rule_review.py`."
        ),
    ),
)


class CapError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class Reading:
    watch: Watch
    current: float
    # The historical extreme in the direction the watch may not move: the
    # minimum for a cap, the maximum for a floor. Named `bound` rather than
    # `floor` since 2026-08-05, when floors joined the ratchet and the old name
    # would have described half the readings wrongly.
    bound: float
    bound_sha: str
    revisions_seen: int
    first_appearance: bool


@dataclass
class Finding:
    check: str
    message: str


@dataclass
class Measurement:
    readings: List[Reading] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


def _git(repo_root: Path, *args: str) -> str:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    proc = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        raise CapError(f"git {' '.join(args)} failed: {proc.stderr.strip() or 'no stderr'}")
    return proc.stdout


# A module-level constant whose name says it bounds something. `MAX_`/`CAP_`/
# `LIMIT_` are ceilings, `MIN_`/`FLOOR_`/`THRESHOLD_` are the other kind; both
# are numbers a change can weaken, so both have to be enumerable. The contract
# test in `tests/test_cap_ratchet.py` walks every `scripts/ci/*.py` with this
# and demands each one be watched — including this file's own, which it used to
# skip, which is how `MAX_REVISIONS` came to be the one cap nothing watched.
#
# Named so that these names do not themselves match: a constant called
# `CAP_PREFIXES` would be enumerated as a bound and, being a tuple rather than a
# number, reported as an unreadable one.
PREFIXES_MEANING_CEILING = ("MAX_", "CAP_", "LIMIT_")
PREFIXES_MEANING_FLOOR = ("MIN_", "FLOOR_", "THRESHOLD_")
BOUND_NAME_PREFIXES = PREFIXES_MEANING_CEILING + PREFIXES_MEANING_FLOOR


@dataclass(frozen=True)
class DeclaredConstant:
    """A module-level bound found by reading the source, never by importing it."""

    name: str
    value: Optional[float]  # None when it is not a plain number
    lineno: int

    @property
    def expected_direction(self) -> str:
        return DOWN if self.name.startswith(PREFIXES_MEANING_CEILING) else UP


def _literal_number(node: Optional[ast.expr]) -> Optional[float]:
    """A numeric literal, or None for anything the reader must not guess at."""
    if node is None:
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, bool):
        return None
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    # `X = -1` parses as a UnaryOp, not a Constant.
    if (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, ast.USub)
        and isinstance(node.operand, ast.Constant)
        and not isinstance(node.operand.value, bool)
        and isinstance(node.operand.value, (int, float))
    ):
        return -float(node.operand.value)
    return None


def module_constants(source: str) -> Dict[str, DeclaredConstant]:
    """Every module-level `NAME = ...`, read statically, never executed.

    Covers plain assignment, chained assignment (`A = B = 5`) and the annotated
    form (`MAX_X: int = 9999`) — the annotated form was invisible to the
    contract test until 2026-08-05, which made it a way to declare an unwatched
    ceiling. A name bound more than once at module level resolves to None
    rather than to its first binding: `MAX_X = 5` followed later by
    `MAX_X = 9999` is not a cap of 5, and reading it as one is worse than
    refusing to read it, because `measure` turns None into a failure.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}
    found: Dict[str, DeclaredConstant] = {}
    rebound: set = set()
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets: List[ast.expr] = list(node.targets)
            value = node.value
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
            value = node.value  # None for a bare `MAX_X: int` declaration
        else:
            continue
        for target in targets:
            if not isinstance(target, ast.Name):
                continue
            if target.id in found:
                rebound.add(target.id)
            found[target.id] = DeclaredConstant(
                name=target.id, value=_literal_number(value), lineno=node.lineno
            )
    for name in rebound:
        found[name] = DeclaredConstant(name=name, value=None, lineno=found[name].lineno)
    return found


def declared_bound_constants(source: str) -> List[DeclaredConstant]:
    """The module-level constants whose names say they bound something."""
    return [
        const
        for const in module_constants(source).values()
        if const.name.startswith(BOUND_NAME_PREFIXES)
    ]


def extract_python_constant(source: str, name: str) -> Optional[float]:
    """Read a module-level `NAME = <number>` without executing the module.

    Returns None when the constant is absent, which for a historical revision
    means "this cap did not exist yet" and for the working tree means the
    caller must fail. Parsed with `ast` rather than exec or regex: the file is
    a control, and importing a control to audit it lets the control decide
    whether it is audited.

    Deliberately the same reader the contract test enumerates with, so a cap
    the enumeration can see is a cap this can read, and vice versa.
    """
    const = module_constants(source).get(name)
    return None if const is None else const.value


def extract_yaml_path(source: str, dotted: str) -> Optional[float]:
    """Read a dotted path out of a YAML document, or None if it is absent."""
    try:
        data = yaml.safe_load(source)
    except yaml.YAMLError:
        return None
    cursor: Any = data
    for part in dotted.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    if isinstance(cursor, bool) or not isinstance(cursor, (int, float)):
        return None
    return float(cursor)


def extract(watch: Watch, source: str) -> Optional[float]:
    if watch.kind == "python-constant":
        return extract_python_constant(source, watch.locator)
    if watch.kind == "yaml-path":
        return extract_yaml_path(source, watch.locator)
    raise CapError(f"{watch.path}: unknown watch kind {watch.kind!r}")


def historical_paths(repo_root: Path, path: str) -> List[str]:
    """Every name this file has had, newest first.

    Without this, `git mv` resets a floor to whatever the value is on the day
    of the rename: the audit renamed a watched file and raised its cap
    150 -> 400 in the same change, and the suite stayed green.

    `--follow` is used here to learn the names and *only* that. It is not the
    walk, because it is not a superset of one: measured on this repository it
    returned 7 revisions of `cap_ratchet.py` where a plain log returned 10 and
    `--full-history` returned 30, dropping every merge commit on the way. A
    shorter history is a higher floor, so the walk below reads the widest view
    git offers and this reads the narrowest thing that answers "what was it
    called before".
    """
    out = _git(
        repo_root,
        "log",
        "--follow",
        "--name-status",
        "--format=%x00%H",
        f"--max-count={MAX_REVISIONS + 1}",
        "--",
        path,
    )
    names = [path]
    current = path
    for line in out.splitlines():
        if line.startswith("\x00") or not line.strip():
            continue
        parts = line.rstrip("\n").split("\t")
        # `R100<TAB>old<TAB>new` — at this commit the followed file is `new`,
        # and in every older commit it is `old`.
        if len(parts) == 3 and parts[0].startswith("R") and parts[2] == current:
            current = parts[1]
            if current not in names:
                names.append(current)
    return names


def revisions_for(repo_root: Path, path: str) -> Tuple[List[str], List[str], bool]:
    """Commits touching `path` or any previous name of it, newest first.

    Returns the revisions, the names walked, and whether the list was cut.

    `--full-history` because the default simplification hides commits that are
    TREESAME to a parent, which on this repository is most of them: 10 of 30
    revisions of `cap_ratchet.py` survive it. Every commit it hides is a value
    this file genuinely held, and a value hidden from the walk can only make the
    bound weaker — a higher floor for a cap, a lower ceiling for a safety floor.
    The widest history is the strictest ratchet, so the walk takes the widest.
    """
    names = historical_paths(repo_root, path)
    out = _git(
        repo_root,
        "log",
        "--full-history",
        f"--max-count={MAX_REVISIONS + 1}",
        "--format=%H",
        "--",
        *names,
    )
    shas = [line.strip() for line in out.splitlines() if line.strip()]
    truncated = len(shas) > MAX_REVISIONS
    return shas[:MAX_REVISIONS], names, truncated


def blob_at(repo_root: Path, sha: str, path: str) -> Optional[str]:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    proc = subprocess.run(
        ["git", "show", f"{sha}:{path}"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        # The path did not exist at that revision, or was a directory. Both
        # mean "no value to compare against here", not a failure.
        return None
    return proc.stdout


def assert_full_history(repo_root: Path) -> None:
    """Refuse to measure a floor from a truncated history.

    A shallow checkout — `actions/checkout` defaults to `fetch-depth: 1` — makes
    `git log -- path` return one revision, so the floor becomes whatever is
    committed right now and every past raise reads as "at floor". That is a
    fail-open path: the gate would report PASS on the exact history it exists to
    read. It is the same shape as the offline branch in `scripts/security-scan.sh`
    that kept regrowing escape hatches, so this one refuses instead.
    """
    if (repo_root / ".git" / "shallow").exists():
        raise CapError(
            "this is a shallow clone, so the history a floor is taken from is not here. "
            "Fetch full history (`fetch-depth: 0`) before running this gate; measuring a "
            "floor from one revision would pass every raise that has already landed."
        )
    out = _git(repo_root, "rev-parse", "--is-shallow-repository").strip()
    if out == "true":
        raise CapError(
            "git reports a shallow repository. Fetch full history (`fetch-depth: 0`) "
            "before running this gate."
        )


def measure(repo_root: Path, watches: Sequence[Watch] = WATCHES) -> Measurement:
    measurement = Measurement()
    assert_full_history(repo_root)

    # One history walk per file, not per watched value: `release_lag.py` alone
    # carries four of them.
    by_path: Dict[str, List[Watch]] = {}
    for watch in watches:
        by_path.setdefault(watch.path, []).append(watch)

    for path, path_watches in by_path.items():
        on_disk = repo_root / path
        if not on_disk.is_file():
            raise CapError(f"{path}: watched file is missing. A cap that is not there caps nothing.")
        source = on_disk.read_text(encoding="utf-8")

        current: Dict[str, float] = {}
        for watch in path_watches:
            if watch.direction not in DIRECTIONS:
                raise CapError(
                    f"{path}: `{watch.locator}` declares direction {watch.direction!r}, which is "
                    f"neither {DOWN!r} nor {UP!r}. A number whose direction nobody declared is a "
                    f"number nothing holds."
                )
            value = extract(watch, source)
            if value is None:
                raise CapError(
                    f"{path}: `{watch.locator}` is missing or is not a plain number. "
                    f"It is {watch.why}; deleting or hiding it is how a cap stops being one."
                )
            current[watch.locator] = value

        shas, names, truncated = revisions_for(repo_root, path)
        if truncated:
            # A NOTE until 2026-08-05, which failed nothing — and the window is
            # set by `MAX_REVISIONS` in this very file, so a partial walk was a
            # floor whoever edited that line got to choose. See the docstring.
            raise CapError(
                f"{path}: the history walk hit the {MAX_REVISIONS}-revision window, so the bound "
                f"would come from part of this file's history rather than all of it. A floor taken "
                f"from a window is a floor whoever set the window chose. Raise `MAX_REVISIONS` in "
                f"scripts/ci/cap_ratchet.py — that is the strict direction, and the ratchet permits "
                f"it — rather than trusting a partial walk."
            )
        history: Dict[str, List[Tuple[float, str]]] = {w.locator: [] for w in path_watches}
        renamed_from: List[str] = []
        for sha in shas:
            blob = None
            for name in names:
                blob = blob_at(repo_root, sha, name)
                if blob is not None:
                    if name != path and name not in renamed_from:
                        renamed_from.append(name)
                    break
            if blob is None:
                continue
            for watch in path_watches:
                value = extract(watch, blob)
                if value is not None:
                    history[watch.locator].append((value, sha))

        for watch in path_watches:
            seen = history[watch.locator]
            if seen:
                # A cap is held to the lowest value it has ever held, a floor to
                # the highest. Same walk, opposite extreme.
                pick = min if watch.direction == DOWN else max
                bound, bound_sha = pick(seen, key=lambda pair: pair[0])
                first_appearance = False
            else:
                # Never committed with this locator present. There is no bound
                # to hold it to yet; today's value becomes it once committed.
                # Reported, not silently passed.
                bound, bound_sha = current[watch.locator], ""
                first_appearance = True
            measurement.readings.append(
                Reading(
                    watch=watch,
                    current=current[watch.locator],
                    bound=bound,
                    bound_sha=bound_sha,
                    revisions_seen=len(seen),
                    first_appearance=first_appearance,
                )
            )
        if renamed_from:
            measurement.notes.append(
                f"{path}: history followed through {len(renamed_from)} earlier name(s) "
                f"({', '.join(renamed_from)}); the bound includes revisions under them."
            )

    measurement.readings.sort(key=lambda r: (r.watch.path, r.watch.locator))
    return measurement


def evaluate(measurement: Measurement) -> List[Finding]:
    """Refuse a cap that moved UP, and a safety floor that moved DOWN.

    Symmetric on purpose. Until 2026-08-05 only the first half existed, so a
    `MIN_*` — the least a human must write before a suppression counts as
    reviewed — could be lowered to zero and this control called it a pass.
    """
    findings: List[Finding] = []
    for reading in measurement.readings:
        if reading.watch.direction == DOWN and reading.current > reading.bound:
            findings.append(
                Finding(
                    check="cap-raised",
                    message=(
                        f"{reading.watch.path}: `{reading.watch.locator}` is {_fmt(reading.current)}, above "
                        f"the lowest value it has ever held ({_fmt(reading.bound)}, "
                        f"{reading.bound_sha[:12]}). This number is {reading.watch.why}. Raising it does "
                        f"not make the underlying problem smaller, it makes the gate stop reporting it; "
                        f"lower it back to {_fmt(reading.bound)} or below."
                    ),
                )
            )
        elif reading.watch.direction == UP and reading.current < reading.bound:
            findings.append(
                Finding(
                    check="floor-lowered",
                    message=(
                        f"{reading.watch.path}: `{reading.watch.locator}` is {_fmt(reading.current)}, BELOW "
                        f"the highest value it has ever held ({_fmt(reading.bound)}, "
                        f"{reading.bound_sha[:12]}). This is a floor, not a cap: it is "
                        f"{reading.watch.why}. Lowering it is the weakening direction, exactly as raising "
                        f"a cap is; raise it back to {_fmt(reading.bound)} or above."
                    ),
                )
            )
    return findings


def _fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def format_report(measurement: Measurement, findings: Sequence[Finding]) -> str:
    lines = ["=== Cap ratchet ==="]
    width = max((len(f"{r.watch.path}:{r.watch.locator}") for r in measurement.readings), default=0)
    for reading in measurement.readings:
        arrow = "cap" if reading.watch.direction == DOWN else "floor"
        label = f"{reading.watch.path}:{reading.watch.locator}".ljust(width)
        if reading.first_appearance:
            state = f"no committed history yet — this run sets the {arrow} bound"
        elif reading.watch.direction == DOWN and reading.current > reading.bound:
            state = f"RAISED from floor {_fmt(reading.bound)} ({reading.revisions_seen} revs)"
        elif reading.watch.direction == UP and reading.current < reading.bound:
            state = f"LOWERED from floor {_fmt(reading.bound)} ({reading.revisions_seen} revs)"
        elif reading.current != reading.bound:
            moved = (
                "lowered below previous floor"
                if reading.watch.direction == DOWN
                else "raised above previous ceiling"
            )
            state = f"{moved} {_fmt(reading.bound)} — new bound"
        else:
            state = f"at {arrow} bound ({reading.revisions_seen} revs)"
        lines.append(f"  {label}  {_fmt(reading.current):>6}  [{arrow}] {state}")
    for note in measurement.notes:
        lines.append(f"NOTE: {note}")
    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        for finding in findings:
            lines.append(f"  [{finding.check}] {finding.message}")
    else:
        caps = sum(1 for r in measurement.readings if r.watch.direction == DOWN)
        floors = len(measurement.readings) - caps
        lines.append(
            f"PASS: {caps} caps, none above its historical floor; "
            f"{floors} floors, none below its historical maximum."
        )
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Refuse any cap that bounds a declared budget from moving upward."
    )
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None, help="repository root (default: two levels up)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        measurement = measure(repo_root)
        findings = evaluate(measurement)
    except CapError as exc:
        if args.json:
            print(json.dumps({"error": str(exc), "ok": False, "measured": False}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not findings,
                    "measured": True,
                    "readings": [
                        {**asdict(r), "watch": asdict(r.watch)} for r in measurement.readings
                    ],
                    "notes": measurement.notes,
                    "findings": [asdict(f) for f in findings],
                },
                indent=2,
            )
        )
    else:
        print(format_report(measurement, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
