#!/usr/bin/env python3
"""
Verify that a baseline remote-tracking ref actually reflects the remote.

`scripts/ci/release_lag.py` and `scripts/ci/branch_collisions.py` both answer
"what has not reached production?" by counting commits that are not in
`origin/main`. Both resolved that baseline with `git rev-parse origin/main` —
i.e. from `refs/remotes/origin/main`, a file in the local repository that any
process may write.

Measured 2026-08-04. `git reflog show refs/remotes/origin/main` on this
repository:

    a4b8f23f refs/remotes/origin/main@{0}: fetch origin --quiet: forced-update
    c5a2d265 refs/remotes/origin/main@{1}:
    a4b8f23f refs/remotes/origin/main@{2}: fetch origin: forced-update
    dd41e0a4 refs/remotes/origin/main@{3}:
    7218a388 refs/remotes/origin/main@{4}:
    a4b8f23f refs/remotes/origin/main@{5}: fetch origin --prune: forced-update
    233c558b refs/remotes/origin/main@{6}:

A fetch records `fetch origin: ...`; a push records `update by push`. A **blank
reason** is `git update-ref refs/remotes/origin/main <local commit>` run
directly. Four such entries are visible, and every subsequent real fetch records
`forced-update` back to `a4b8f23f` — which `git ls-remote origin main` confirms
is the true remote tip, dated 2026-07-31.

The consequence, measured: with the doctored ref in place the release-lag gate
reported `Unshipped commits: 2` against a budget of 125 and passed. After a
plain `git fetch`, the true figure was 336 commits unshipped, oldest 4 days old.
The control that exists to answer "did this work reach production?" was
answering "yes" because its definition of production had been set to a local
commit. That is this repository's recorded defect class — a gate that is
declared, reachable, executed and incapable of failing — with a forged input
rather than merely a narrow one.

So the baseline is no longer taken on trust. `verify_baseline` asks the remote
itself with `git ls-remote` and compares. There are five outcomes and exactly
one of them is a pass:

  * `verified`          — remote and local tracking ref agree. The only pass.
  * `diverged`          — they disagree. Neither is preferred; the run refuses
                          and names both shas.
  * `missing-on-remote` — the branch does not exist on the remote at all.
  * `not-a-remote-ref`  — the declared baseline is not `<remote>/<branch>` for
                          any configured remote, so there is nothing to check
                          it against.
  * `unreachable`       — the remote could not be contacted.

`unreachable` is deliberately *not* a pass. A run that could not reach the
remote has not verified delivery, and this repository has been burned
repeatedly by controls that skip when their input is missing and print PASSED.
It is reported as its own distinct finding so a reader can tell "we could not
check" from "we checked and it is wrong" at a glance — but both are failures,
because the one thing neither may do is fall through to the local ref in
silence.

This module reads. It never writes a ref, never fetches, and never pushes.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Set, Tuple

STATE_VERIFIED = "verified"
STATE_DIVERGED = "diverged"
STATE_MISSING_ON_REMOTE = "missing-on-remote"
STATE_NOT_A_REMOTE_REF = "not-a-remote-ref"
STATE_UNREACHABLE = "unreachable"

#: The single passing state. Anything else means delivery was not verified.
PASSING_STATES = frozenset({STATE_VERIFIED})

#: Seconds to wait for the remote. Long enough for a slow network, short enough
#: that a hung credential prompt or a black-holed host does not stall CI. There
#: is no `timeout` binary on this machine; this is the subprocess timeout.
DEFAULT_TIMEOUT_SECONDS = 25

#: Check ids, so both callers name the same failure the same way.
CHECK_DIVERGED = "baseline-forged"
CHECK_UNVERIFIED = "baseline-unverified"


@dataclass
class BaselineTrust:
    """What the remote says about the ref this repository is measuring against."""

    ref: str
    remote: str
    branch: str
    local_sha: str
    remote_sha: str
    state: str
    detail: str = ""

    @property
    def verified(self) -> bool:
        return self.state in PASSING_STATES


def _run(args: Sequence[str], repo_root: Path, timeout: Optional[int] = None) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    # Never block on a credential prompt: an interactive git would hang CI
    # forever, and a hang is a worse failure mode than a refusal.
    env["GIT_TERMINAL_PROMPT"] = "0"
    # NOTE: unlike the local-only git calls in the two callers, the global and
    # system git config are deliberately *left in place* here. The credential
    # helper that authenticates to the remote lives there, and stripping it
    # would turn every run into `unreachable` — a control that always reports
    # "could not verify" is no more use than one that always reports PASSED.
    return subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        env=env,
        timeout=timeout,
    )


def configured_remotes(repo_root: Path) -> Set[str]:
    result = _run(["remote"], repo_root, timeout=DEFAULT_TIMEOUT_SECONDS)
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def split_remote_ref(baseline_ref: str, remotes: Set[str]) -> Optional[Tuple[str, str]]:
    """Split `origin/main` into (`origin`, `main`) using the configured remotes.

    Matched against real remote names rather than by splitting on the first
    slash, so a branch with slashes in it (`origin/release/1.0`) resolves to the
    remote `origin` and the branch `release/1.0`. Longest remote name wins.
    """
    candidates = [r for r in remotes if baseline_ref.startswith(f"{r}/") and len(baseline_ref) > len(r) + 1]
    if not candidates:
        return None
    remote = max(candidates, key=len)
    return remote, baseline_ref[len(remote) + 1 :]


def _local_sha(repo_root: Path, baseline_ref: str) -> str:
    result = _run(["rev-parse", "--verify", f"{baseline_ref}^{{commit}}"], repo_root, timeout=DEFAULT_TIMEOUT_SECONDS)
    return result.stdout.strip() if result.returncode == 0 else ""


def verify_baseline(
    repo_root: Path,
    baseline_ref: str,
    local_sha: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> BaselineTrust:
    """Ask the remote what `baseline_ref` should be, and compare.

    Read-only. Does not fetch, does not update any ref, does not push.
    """
    if local_sha is None:
        local_sha = _local_sha(repo_root, baseline_ref)

    remotes = configured_remotes(repo_root)
    split = split_remote_ref(baseline_ref, remotes)
    if split is None:
        return BaselineTrust(
            ref=baseline_ref,
            remote="",
            branch="",
            local_sha=local_sha,
            remote_sha="",
            state=STATE_NOT_A_REMOTE_REF,
            detail=(
                f"{baseline_ref!r} is not `<remote>/<branch>` for any configured remote "
                f"({', '.join(sorted(remotes)) or 'none configured'}), so there is no remote to check it "
                f"against. A baseline that only exists locally cannot stand for production."
            ),
        )

    remote, branch = split
    try:
        result = _run(["ls-remote", "--exit-code", remote, f"refs/heads/{branch}"], repo_root, timeout=timeout)
    except subprocess.TimeoutExpired:
        return BaselineTrust(
            ref=baseline_ref,
            remote=remote,
            branch=branch,
            local_sha=local_sha,
            remote_sha="",
            state=STATE_UNREACHABLE,
            detail=f"`git ls-remote {remote} refs/heads/{branch}` did not answer within {timeout}s.",
        )

    if result.returncode == 2:
        return BaselineTrust(
            ref=baseline_ref,
            remote=remote,
            branch=branch,
            local_sha=local_sha,
            remote_sha="",
            state=STATE_MISSING_ON_REMOTE,
            detail=(
                f"remote {remote!r} has no branch {branch!r}, but {baseline_ref} resolves locally to "
                f"{local_sha[:12] or '(nothing)'}. The local tracking ref is standing for a branch that "
                f"does not exist on the remote."
            ),
        )

    if result.returncode != 0:
        return BaselineTrust(
            ref=baseline_ref,
            remote=remote,
            branch=branch,
            local_sha=local_sha,
            remote_sha="",
            state=STATE_UNREACHABLE,
            detail=(
                f"`git ls-remote {remote} refs/heads/{branch}` failed ({result.returncode}): "
                f"{result.stderr.strip() or 'no output'}"
            ),
        )

    remote_sha = ""
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1] == f"refs/heads/{branch}":
            remote_sha = parts[0]
            break

    if not remote_sha:
        return BaselineTrust(
            ref=baseline_ref,
            remote=remote,
            branch=branch,
            local_sha=local_sha,
            remote_sha="",
            state=STATE_UNREACHABLE,
            detail=(
                f"`git ls-remote {remote} refs/heads/{branch}` succeeded but named no sha for the branch; "
                f"output was {result.stdout.strip()!r}."
            ),
        )

    if remote_sha != local_sha:
        return BaselineTrust(
            ref=baseline_ref,
            remote=remote,
            branch=branch,
            local_sha=local_sha,
            remote_sha=remote_sha,
            state=STATE_DIVERGED,
            detail=(
                f"the local tracking ref does not reflect the remote: {baseline_ref} is "
                f"{local_sha or '(unresolvable)'} locally but {remote}/{branch} is {remote_sha} on the "
                f"remote. Neither is preferred and neither is used."
            ),
        )

    return BaselineTrust(
        ref=baseline_ref,
        remote=remote,
        branch=branch,
        local_sha=local_sha,
        remote_sha=remote_sha,
        state=STATE_VERIFIED,
        detail=f"{baseline_ref} matches {remote}/{branch} on the remote at {remote_sha[:12]}.",
    )


def trust_findings(trust: BaselineTrust) -> List[Tuple[str, str]]:
    """Findings for a baseline that was not verified. `(check_id, message)`.

    Returned as plain tuples so each caller wraps them in its own finding type
    without the two controls having to share one.

    Every non-`verified` state produces a finding. There is no state that
    produces none — that is the whole content of this module.
    """
    if trust.verified:
        return []

    if trust.state == STATE_DIVERGED:
        return [
            (
                CHECK_DIVERGED,
                f"{trust.detail} `refs/remotes/{trust.remote}/{trust.branch}` is writable locally and has "
                f"been written by hand in this repository (four `git update-ref` entries with a blank "
                f"reflog reason, each undone by the next real fetch). A measurement against a doctored "
                f"baseline reports whatever the person who wrote the ref wanted it to report. Run "
                f"`git fetch {trust.remote}` and re-run; do not adjust any budget to fit this.",
            )
        ]

    return [
        (
            CHECK_UNVERIFIED,
            f"the baseline {trust.ref} could not be verified against the remote ({trust.state}): "
            f"{trust.detail} Delivery is therefore unverified, and an unverified baseline is not "
            f"reported as a pass — the local tracking ref is not evidence about production, it is a "
            f"local file.",
        )
    ]


def describe(trust: BaselineTrust) -> str:
    """One line for a human report."""
    if trust.verified:
        return (
            f"Baseline verified:   {trust.ref} == {trust.remote}/{trust.branch} on the remote "
            f"@ {trust.remote_sha[:12]}"
        )
    return f"Baseline UNVERIFIED: [{trust.state}] {trust.detail}"
