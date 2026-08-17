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
directly. Four such entries were visible that day, and every subsequent real
fetch records `forced-update` back to `a4b8f23f` — which `git ls-remote origin
main` confirms is the true remote tip, dated 2026-07-31.

**Four was a reading, not a property, and the message used to state it as one.**
Re-measured 2026-08-05: **34** blank-reason entries out of 173, the most recent
seven minutes before the measurement, alternating with real fetches that undo
them — the practice did not stop, it accelerated, and the finding still called it
four. A frozen count also reads as a closed incident, which makes `git fetch`
look like the whole remedy when the actual remedy is to find what keeps writing
the ref. Worse, it was emitted on *every* diverged run: an ordinary stale fetch,
where nothing had been written by hand at all, was told it had been, four times.
`hand_written_history` now counts the entries on the run that reports them, and
`describe_hand_written` says which of the three situations it found.

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

#: Field separator for the reflog read below. A reflog *reason* is free text —
#: git writes `fetch origin: forced-update`, and whoever runs `update-ref`
#: writes whatever they like — so the fields are split on a control character
#: that cannot occur inside one, not on a space or a colon.
_REFLOG_SEP = "\x1f"


@dataclass
class HandWrittenHistory:
    """Reflog evidence about what has written a tracking ref, and when.

    `readable` is false when the reflog could not be read at all, and that is
    kept distinct from `hand_written == 0`. "Nobody wrote this by hand" and "we
    could not tell" are different facts, and collapsing them is how this
    control's own message came to assert a number nobody had measured.
    """

    readable: bool
    total: int = 0
    hand_written: int = 0
    latest_date: str = ""
    latest_sha: str = ""


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
    #: Populated only when the state is `diverged`, because that is the only
    #: state where "who wrote this ref?" is the reader's next question. New
    #: field, last and defaulted, so the positional construction in the tests
    #: and any other caller keeps working.
    hand_written: Optional[HandWrittenHistory] = None

    @property
    def verified(self) -> bool:
        return self.state in PASSING_STATES


def _run(args: Sequence[str], repo_root: Path, timeout: Optional[int] = None) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    # Never block on a credential prompt: an interactive git would hang CI
    # forever, and a hang is a worse failure mode than a refusal.
    env["GIT_TERMINAL_PROMPT"] = "0"
    # NOTE: unlike the local-only git calls in the two callers, the global and
    # system git config are deliberately *left in place* here when readable. The
    # credential helper that authenticates to the remote lives there, and stripping
    # it would turn every run into `unreachable` — a control that always reports
    # "could not verify" is no more use than one that always reports PASSED.
    # However, if global config is not readable (e.g. sandbox or permissions),
    # fall back to /dev/null so git commands do not fail with EACCES.
    if "GIT_CONFIG_GLOBAL" not in env:
        try:
            global_config = Path(os.path.expanduser("~/.gitconfig"))
            if not os.access(global_config, os.R_OK):
                env["GIT_CONFIG_GLOBAL"] = "/dev/null"
        except OSError:
            env["GIT_CONFIG_GLOBAL"] = "/dev/null"
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


def _reflog_date(selector: str) -> str:
    """The date out of a `--date=` reflog selector like `origin/main@{2026-08-05T20:04:03+04:00}`.

    Between the *first* `@{` and the *last* `}`, because a branch name may
    contain neither but a date offset contains no braces either way, and being
    wrong here costs a date in a message rather than a verdict.
    """
    start = selector.find("@{")
    end = selector.rfind("}")
    if start == -1 or end <= start:
        return ""
    return selector[start + 2 : end]


def hand_written_history(
    repo_root: Path,
    ref: str,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> HandWrittenHistory:
    """Count the writes to `ref` that no git operation accounts for.

    A fetch records `fetch origin: forced-update`, a push records
    `update by push`, a branch update records `branch: ...`. `git update-ref`
    records **nothing** — a blank reason — so a blank-reason entry is a write
    that some process made directly, and that is exactly the forgery this
    module exists to refuse.

    This is measured on every diverged run rather than written down once. The
    number it replaced was a literal `four`, correct when it was observed on
    2026-08-04 and eight times too small a day later, which mattered because a
    count that reads as a closed historical incident invites `git fetch` as the
    whole remedy while the practice continues.

    Read-only: `reflog show` never writes a ref. Missing reflogs are normal —
    a fresh clone has none for a ref it has not seen change — so an
    unreadable or empty reflog is reported as such and never as zero.
    """
    result = _run(
        [
            "reflog",
            "show",
            "--date=iso-strict",
            f"--format=%H{_REFLOG_SEP}%gd{_REFLOG_SEP}%gs",
            ref,
        ],
        repo_root,
        timeout=timeout,
    )
    if result.returncode != 0:
        return HandWrittenHistory(readable=False)

    total = 0
    hand_written = 0
    latest_date = ""
    latest_sha = ""
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        fields = line.split(_REFLOG_SEP)
        if len(fields) < 3:
            continue
        total += 1
        sha, selector, reason = fields[0], fields[1], fields[2]
        if reason.strip():
            continue
        hand_written += 1
        # `reflog show` is newest-first, so the first blank one is the latest.
        if not latest_sha:
            latest_sha = sha
            latest_date = _reflog_date(selector)

    if total == 0:
        return HandWrittenHistory(readable=False)
    return HandWrittenHistory(
        readable=True,
        total=total,
        hand_written=hand_written,
        latest_date=latest_date,
        latest_sha=latest_sha,
    )


def verify_baseline(
    repo_root: Path,
    baseline_ref: str,
    local_sha: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> BaselineTrust:
    """Ask the remote what `baseline_ref` should be, and compare.

    Read-only. Does not fetch, does not update any ref, does not push.

    No environment variable may buy `STATE_VERIFIED`, and none is read here.
    `verified` is a statement that a remote answered and its sha matched; if the
    remote could not be asked, the honest answer is `STATE_UNREACHABLE` and the
    four gates that divide by it (release lag, integration debt, deployment lag,
    the cap ratchet) must fail closed. A waiver may soften how a *caller* reacts
    to `unreachable`. It may never change the answer.

    This has now been landed twice — most recently by `39d2d89d` on 2026-08-17,
    which returned `verified` with `remote_sha = local_sha` whenever `ls-remote`
    timed out or exited non-zero and either `BASELINE_TRUST_ALLOW_OFFLINE=1` or
    `SECURITY_SCAN_ALLOW_OFFLINE=1` was set. The second name is the trap: it is
    the dependency audit's own narrow waiver, exported defaulted to `1` by both
    `scripts/verify-all.sh` and `scripts/test-ci.sh`, so the hatch was on by
    default under both runners and every one of those four gates would have
    reported a baseline `verified` against a ref no remote ever confirmed.
    `tests/test_baseline_trust_offline.py` forbids exactly this and was already
    committed when the hatch landed on top of it; read that file before adding
    any offline handling here.
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
        # No offline waiver is read here, deliberately. See the module note
        # above `verify_baseline` and `tests/test_baseline_trust_offline.py`:
        # a waiver may excuse an *exit code*, never the answer to "did a remote
        # answer". `STATE_UNREACHABLE` is the honest state, and it is what the
        # four lag gates need in order to refuse rather than to read zero.
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
        # Same reasoning as the timeout branch above: an unanswered remote is
        # `unreachable`, whatever the environment says.
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
            hand_written=hand_written_history(repo_root, baseline_ref, timeout=timeout),
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


def describe_hand_written(trust: BaselineTrust) -> str:
    """The forgery evidence for a diverged baseline, as measured on this run.

    Three distinct sentences for three distinct facts, because they call for
    three different actions:

      * writes found  — something in this environment is standing the baseline
                        up by hand. A fetch repairs the measurement and not the
                        cause, so the message says to find the writer.
      * none found    — divergence with a clean reflog is an ordinary stale
                        fetch. Naming a forger here would be an accusation the
                        evidence does not support, which is what the literal
                        `four` did on every diverged run regardless of cause.
      * unmeasured    — say so. An unreadable reflog is not a clean one.
    """
    history = trust.hand_written
    blank = "a blank reflog reason, which is what `git update-ref` records and no other git operation does"

    if history is None or not history.readable:
        return (
            f"Whether it has been written by hand here is unmeasured: this run could not read "
            f"`git reflog show {trust.ref}`, and an unreadable reflog is not a clean one."
        )

    if history.hand_written == 0:
        return (
            f"Nothing has written it by hand in this repository — all {history.total} reflog "
            f"entries carry a reason — so this is most likely a stale fetch rather than a forged "
            f"baseline ({blank})."
        )

    occasions = "once" if history.hand_written == 1 else f"{history.hand_written} times"
    when = f" most recently at {history.latest_date}" if history.latest_date else ""
    latest = f" to {history.latest_sha[:12]}" if history.latest_sha else ""
    return (
        f"It has been written by hand in this repository {occasions} — {history.hand_written} of "
        f"{history.total} reflog entries carry {blank} —{when}{latest}. A fetch repairs this "
        f"measurement but not the practice: find what writes the ref."
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
                f"{trust.detail} `refs/remotes/{trust.remote}/{trust.branch}` is writable locally by any "
                f"process. {describe_hand_written(trust)} A measurement against a doctored baseline "
                f"reports whatever the process that wrote the ref wanted it to report. Run "
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
