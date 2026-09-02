#!/usr/bin/env python3
"""Codex budget governor.

GitOps syncs this script, the policy ConfigMap, and a suspended CronJob.
The governor decides *whether* a Job exists. It does not keep Codex
processes hot.

Decision path is pure (no Kubernetes, no network). `main()` is the thin
in-cluster wrapper: read policy/queue/state, list running Jobs, maybe
create one. Agents themselves never receive a kubeconfig.

Policy knobs (all in git):

  enabled                  kill switch; default false
  maxConcurrent            start at 1 — the cpx22 is 4 GB
  targetUtilization        fraction of the 5-hour window to occupy
  reserveForInteractive    caps the usable fraction at (1 - this) whenever
                           that is tighter than targetUtilization — see
                           Policy.effective_window_budget(). Raise it to
                           actually shrink the automated budget when a
                           CODEX_AUTH_JSON seat is shared with interactive
                           use, per agents/secrets/README.md. At the
                           policy.json default (0.10, against
                           targetUtilization 0.90) the two exactly cancel
                           and it has no effect — which is what made this
                           look unused until it was raised.
  weeklyBudgetFraction     stop early in the week so you do not go dark
  cooldownOnLimitSeconds   sleep after a 429 instead of retrying immediately
  cooldownOnAuthFailureSeconds
                           sleep after a *rejected credential*, which retrying
                           cannot fix — only a re-`codex login` and a re-seal
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Literal

WINDOW_SECONDS_DEFAULT = 5 * 60 * 60
WEEK_SECONDS = 7 * 24 * 60 * 60

LIMIT_PATTERNS = (
    re.compile(r"\b429\b"),
    re.compile(r"rate[\s_-]?limit", re.I),
    re.compile(r"usage[\s_-]?limit", re.I),
    re.compile(r"exceeded.*(?:quota|limit)", re.I),
    re.compile(r"hit your (?:usage )?limit", re.I),
    re.compile(r"limit reached", re.I),
)

EXIT_LIMIT = 42

# A run that finished cleanly but produced nothing — no diff, so no commit, no
# branch, no PR. `worker.sh` reports it by writing NOOP_MARKER to
# /dev/termination-log (and, for a caller that would rather use an exit code,
# by exiting EXIT_NOOP). Either signal means the same thing: the Job spent
# Codex quota and the repository is unchanged.
#
# This is not a failure and must never be treated as one. It is the ordinary
# outcome of an item whose work has run out — `open-pr-repair-merge` on a repo
# with zero open PRs, `branch-pr-drain` when every branch is already merged.
# Both were true here on 2026-08-31, and together those two items carry
# 13/25ths of the weight `pick_item` hands out, so more than half of a plan's
# included quota would go to Jobs that clone the repo, boot Codex, find nothing
# and exit. See `noops_by_item` for what is done about it.
NOOP_MARKER = "codex-noop"
EXIT_NOOP = 44

# The Codex credential was *rejected* — expired, rotated, revoked, or never
# sealed at all. `worker.sh` has always exited EXIT_AUTH for this, deliberately
# distinct from EXIT_LIMIT, and `agents/secrets/README.md` states the reason in
# so many words: "Backing off for an hour does not fix an expired login, and
# the two should not be read as the same event."
#
# Nothing on this side honoured that. The governor branched on EXIT_LIMIT and
# on the no-op marker and treated everything else as an ordinary failure, so a
# rejected credential fell through to "start the next item" — and the next
# item's Job failed the same way, every five minutes, ~288 times a day. Each
# one `apt-get install`s gh and `npm install -g`s the Codex CLI on the 4 GB
# cpx22 before it can even discover the credential is bad, and none of it can
# ever succeed: no amount of retrying re-runs `codex login` on the owner's
# laptop.
#
# That matters most on the route the owner actually chose. A metered
# OPENAI_API_KEY is static; `CODEX_AUTH_JSON` — the built-in-plan quota — is
# the one Codex *rotates on use*, so a wedged credential is its ordinary
# failure mode rather than a hypothetical one. It was the only failure mode of
# the chosen route that the control loop could not report.
#
# Held, not stopped: see `Policy.cooldown_on_auth_failure_seconds` for why this
# is a long cooldown rather than a latch.
AUTH_MARKER = "codex-auth-rejected"
EXIT_AUTH = 43

# Ceiling on the consecutive-no-op count that damps an item's score. Without it
# an item that has been empty for a week sinks so far it can never run again —
# and then it cannot discover that its work came back. Capped, a fully damped
# item still surfaces every so often as a cheap probe.
MAX_NOOP_DAMPING = 10


@dataclass(frozen=True)
class Policy:
    enabled: bool = False
    max_concurrent: int = 1
    target_utilization: float = 0.90
    reserve_for_interactive: float = 0.10
    weekly_budget_fraction: float = 0.85
    window_seconds: int = WINDOW_SECONDS_DEFAULT
    cooldown_on_limit_seconds: int = 60 * 60
    # Longer than the limit cooldown because the two need opposite things. A
    # 429 clears itself when the window rolls; a rejected credential clears
    # only when a human re-runs `codex login` and re-seals, so retrying sooner
    # buys nothing. Six hours puts the ceiling at four wasted Jobs a day
    # instead of the CronJob's 288.
    #
    # A *cooldown* and not a latch, deliberately. A latch would be tighter on
    # waste but would need something to release it, and the governor cannot
    # see `codex-secrets` to notice a re-seal — its Role grants no Secret
    # access, and widening that to watch a credential it must never read would
    # trade a bounded amount of churn for an unbounded amount of blast radius.
    # A cooldown needs no release: worker.sh re-seeds the PVC whenever the
    # sealed value's fingerprint changes, so the first Job after the sleep
    # picks the new credential up on its own, and a *transient* rejection
    # cannot wedge the fleet for good.
    cooldown_on_auth_failure_seconds: int = 6 * 60 * 60
    models: dict[str, str] = field(
        default_factory=lambda: {"chore": "gpt-5-mini", "deep": "gpt-5"}
    )

    def effective_window_budget(self) -> float:
        # reserveForInteractive is the slack inside the window. At the
        # policy.json default it is exactly cancelled by targetUtilization
        # (0.90 == 1 - 0.10), so the min() below is a no-op there — do not
        # read that as reserveForInteractive having no effect. Raise it past
        # (1 - targetUtilization) — the move agents/secrets/README.md
        # describes for a shared ChatGPT-plan seat — and it binds, shrinking
        # the budget below what targetUtilization alone would allow.
        # test_effective_window_budget_reserve_can_bind_tighter_than_target
        # exercises the case this comment used to leave untested.
        usable = min(self.target_utilization, 1.0 - self.reserve_for_interactive)
        return max(0.0, usable) * self.window_seconds


@dataclass
class BudgetState:
    window_started_at: float
    estimated_seconds_used: float
    week_started_at: float
    week_seconds_used: float
    last_limit_at: float | None = None
    # When a Job last came back with a rejected Codex credential. See
    # AUTH_MARKER / EXIT_AUTH.
    last_auth_failure_at: float | None = None
    jobs_started_this_window: int = 0
    accounted_job_uids: list[str] = field(default_factory=list)
    # How many Jobs each queue item has been started for in the current
    # window. `pick_item` divides by this so a permanently-enabled top item
    # cannot take every tick. Reset by `rollover`, which is what bounds it.
    runs_by_item: dict[str, int] = field(default_factory=dict)
    # Consecutive finished Jobs for each item that changed nothing, keyed by the
    # item's DNS-1123 form (the `governor.item` Job label is the only item
    # identity a finished Job carries back). Reset to 0 by the first productive
    # run, and deliberately *not* reset by `rollover`: an item whose work has
    # run out is still empty in the next window, and re-learning that every five
    # hours is the waste this counter exists to stop.
    noops_by_item: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class JobView:
    uid: str
    active: int = 0
    succeeded: bool = False
    failed: bool = False
    duration_seconds: float | None = None
    limit_hit: bool = False
    # The `governor.item` label, i.e. the DNS-1123 form of the queue item id.
    # Empty for a Job the governor did not label (an older one, or something
    # else in the namespace) — such a Job is accounted for time but credited to
    # no item, which is the safe direction.
    item: str = ""
    # The run finished cleanly and changed nothing. See NOOP_MARKER.
    noop: bool = False
    # The Codex credential was rejected. See AUTH_MARKER.
    auth_failed: bool = False


@dataclass(frozen=True)
class QueueItem:
    id: str
    repo: str
    prompt: str
    model_class: Literal["chore", "deep"] = "chore"
    priority: int = 0
    enabled: bool = True
    ref: str = "main"
    workdir: str = ""
    # Who pushes the branch and opens the PR. "harness" (the default) means
    # worker.sh folds the working tree into one commit and opens the PR after
    # the agent exits. "agent" means the item's own prompt does it, which is
    # the only workable mode for a task that spans several branches.
    delivery: Literal["harness", "agent"] = "harness"


@dataclass(frozen=True)
class Decision:
    action: Literal["start", "hold"]
    reason: str
    item: QueueItem | None = None
    model: str | None = None
    sleep_seconds: int = 0


def parse_limit_error(text: str) -> bool:
    if not text:
        return False
    return any(pat.search(text) for pat in LIMIT_PATTERNS)


def policy_from_dict(raw: dict[str, Any] | None) -> Policy:
    data = raw or {}
    models = data.get("models") or {}
    return Policy(
        enabled=bool(data.get("enabled", False)),
        max_concurrent=max(1, int(data.get("maxConcurrent", 1))),
        target_utilization=float(data.get("targetUtilization", 0.90)),
        reserve_for_interactive=float(data.get("reserveForInteractive", 0.10)),
        weekly_budget_fraction=float(data.get("weeklyBudgetFraction", 0.85)),
        window_seconds=int(data.get("windowSeconds", WINDOW_SECONDS_DEFAULT)),
        cooldown_on_limit_seconds=int(data.get("cooldownOnLimitSeconds", 3600)),
        cooldown_on_auth_failure_seconds=int(
            data.get("cooldownOnAuthFailureSeconds", 6 * 3600)
        ),
        models={
            "chore": str(models.get("chore", "gpt-5-mini")),
            "deep": str(models.get("deep", "gpt-5")),
        },
    )


def queue_item_from_dict(raw: dict[str, Any]) -> QueueItem:
    item_id = str(raw.get("id") or "").strip()
    repo = str(raw.get("repo") or "").strip()
    prompt = str(raw.get("prompt") or "").strip()
    if not item_id or not repo or not prompt:
        raise ValueError("queue item needs id, repo, and prompt")
    model_class = raw.get("modelClass") or raw.get("model_class") or "chore"
    if model_class not in ("chore", "deep"):
        raise ValueError(f"unsupported modelClass: {model_class}")
    delivery = str(raw.get("delivery") or "harness")
    if delivery not in ("harness", "agent"):
        raise ValueError(f"unsupported delivery: {delivery}")
    return QueueItem(
        id=item_id,
        repo=repo,
        prompt=prompt,
        model_class=model_class,
        priority=int(raw.get("priority") or 0),
        enabled=bool(raw.get("enabled", True)),
        ref=str(raw.get("ref") or "main"),
        workdir=str(raw.get("workdir") or ""),
        delivery=delivery,
    )


def load_queue(items: Iterable[dict[str, Any]]) -> list[QueueItem]:
    out: list[QueueItem] = []
    for raw in items:
        try:
            out.append(queue_item_from_dict(raw))
        except ValueError:
            continue
    return out


def pick_item(
    queue: Iterable[QueueItem],
    runs_by_item: dict[str, int] | None = None,
    noops_by_item: dict[str, int] | None = None,
) -> QueueItem | None:
    """Pick the next item, weighting priority against how often it has run.

    This used to be `sorted(key=(-priority, id))[0]` -- the single
    highest-priority enabled item, every tick, forever. That starves every
    other item: with only one item able to run, the rest were unreachable
    until someone edited priorities in git.

    That was tolerable while the PR/branch backlog was the bottleneck. It
    stopped being tolerable once the backlog drained: on 2026-08-30 the repo
    had zero open PRs and every one of ~180 unmerged branches was superseded,
    so the top item had nothing to do and would still have taken 100% of the
    Codex quota -- re-triaging an empty queue every run.

    Score is `(priority + 1) / (runs + 1)`. The `+1` on priority keeps a
    priority-0 item from being weightless (score 0 can never win), so no
    enabled item starves. Within a window the first pick is still the
    highest-priority item, and over many picks the items run in roughly their
    weight ratio. As of the 2026-09-01 reprioritization the six enabled items
    (`gitops/agents/queue/*.yaml` is the source of truth, not this docstring)
    are deploy-cicd-readiness 7, marketing-distribution 6, open-pr-repair-merge
    5, branch-pr-drain 4, seo-discoverability-audit 3,
    product-feature-improvement 2 -- weight ratio 8:7:6:5:4:3. Ties break
    toward higher priority, then by id, so the choice stays deterministic.

    That fixed starvation but not waste. Weighting by priority alone assumes
    every item always has work, and some provably do not: on 2026-08-31, with
    zero open PRs and every branch merged, `open-pr-repair-merge` and
    `branch-pr-drain` -- then the two highest-priority items -- were 13/25ths
    of the weight and 0 of the output. Re-derive the current fraction from the
    queue YAMLs rather than trusting a number here; it moves every time the
    queue is reprioritized (weight is `priority + 1`, denominator is the sum
    of `priority + 1` over every `enabled: true` item). So the
    score is damped a second time by `noops_by_item` -- how many finished runs
    in a row that item changed nothing:

        (priority + 1) / ((runs + 1) * (noops + 1))

    An item that keeps coming up empty fades, handing its share to items that
    still deliver; the first productive run clears the damping outright. The
    fade is bounded by MAX_NOOP_DAMPING so an item never disappears, which is
    what lets it notice its work has come back. Nothing here is disabled and no
    priority is edited -- an empty item is quiet, not gone.

    `noops_by_item` is keyed by the DNS-1123 item id, because a finished Job
    carries its item only as the `governor.item` label.
    """
    enabled = [item for item in queue if item.enabled]
    if not enabled:
        return None
    runs = runs_by_item or {}
    noops = noops_by_item or {}

    def rank(item: QueueItem) -> tuple[float, int, str]:
        # Sorted ascending, so negate the two "bigger wins" terms and leave the
        # id ascending -- the same final tiebreak the old `sorted(..., id)[0]`
        # used, which keeps the choice stable across governor restarts.
        empty = min(noops.get(_dns1123(item.id), 0), MAX_NOOP_DAMPING)
        score = (item.priority + 1) / ((runs.get(item.id, 0) + 1) * (empty + 1))
        return (-score, -item.priority, item.id)

    return min(enabled, key=rank)


def rollover(state: BudgetState, now: float, policy: Policy) -> BudgetState:
    window_started = state.window_started_at
    week_started = state.week_started_at
    used = state.estimated_seconds_used
    week_used = state.week_seconds_used
    started = state.jobs_started_this_window
    runs = state.runs_by_item
    if now - window_started >= policy.window_seconds:
        window_started = now
        used = 0.0
        started = 0
        # Clearing this both bounds the dict (ids of items long since deleted
        # from the queue cannot accumulate) and restarts the rotation, so each
        # window opens on the highest-priority item again.
        runs = {}
    if now - week_started >= WEEK_SECONDS:
        week_started = now
        week_used = 0.0
    return BudgetState(
        window_started_at=window_started,
        estimated_seconds_used=used,
        week_started_at=week_started,
        week_seconds_used=week_used,
        last_limit_at=state.last_limit_at,
        # Survives the window reset for the same reason `noops_by_item` does:
        # a credential the API rejected at 12:00 is still rejected when the
        # 5-hour window rolls at 13:00. Only a re-seal changes it, and only
        # the cooldown expiring lets the fleet find that out.
        last_auth_failure_at=state.last_auth_failure_at,
        jobs_started_this_window=started,
        # Copied, not aliased: BudgetState is mutable and absorb_finished_jobs
        # appends to this list, so sharing it would let the returned state and
        # the one passed in drift into each other.
        accounted_job_uids=list(state.accounted_job_uids),
        runs_by_item=dict(runs),
        # Deliberately survives the window reset above. `runs_by_item` is a
        # within-window rotation and starting it over each window is the point;
        # "this item has had nothing to do for three runs" is a fact about the
        # repository, not about the window, and re-discovering it every five
        # hours at the cost of a Codex Job is exactly the waste being removed.
        # Bounded instead by MAX_NOOP_DAMPING per entry and by `prune_noops`,
        # which drops ids no longer in the queue.
        noops_by_item=dict(state.noops_by_item),
    )


def prune_noops(state: BudgetState, queue: Iterable[QueueItem]) -> BudgetState:
    """Drop damping for ids the queue no longer has.

    `runs_by_item` is bounded because `rollover` empties it every window.
    `noops_by_item` is not, by design, so an item deleted or renamed in git
    would otherwise leave its counter behind forever.
    """
    live = {_dns1123(item.id) for item in queue}
    state.noops_by_item = {k: v for k, v in state.noops_by_item.items() if k in live}
    return state


def decide(
    policy: Policy,
    state: BudgetState,
    running_count: int,
    queue: Iterable[QueueItem],
    now: float,
) -> Decision:
    if not policy.enabled:
        return Decision("hold", "governor disabled")

    state = rollover(state, now, policy)

    if state.last_limit_at is not None:
        elapsed = now - state.last_limit_at
        if elapsed < policy.cooldown_on_limit_seconds:
            sleep_for = int(policy.cooldown_on_limit_seconds - elapsed)
            return Decision(
                "hold",
                "limit error cooldown",
                sleep_seconds=max(sleep_for, 1),
            )

    # Below the limit cooldown deliberately. If both stand, the 429 is the one
    # that will clear on its own, so reporting it is more useful than reporting
    # the one that needs a laptop.
    if state.last_auth_failure_at is not None:
        elapsed = now - state.last_auth_failure_at
        if elapsed < policy.cooldown_on_auth_failure_seconds:
            sleep_for = int(policy.cooldown_on_auth_failure_seconds - elapsed)
            return Decision(
                "hold",
                "Codex credential rejected — re-run `codex login` and re-seal "
                "codex-secrets (gitops/agents/secrets/README.md); retrying "
                "cannot fix this",
                sleep_seconds=max(sleep_for, 1),
            )

    if running_count >= policy.max_concurrent:
        return Decision("hold", f"already running {running_count} (max {policy.max_concurrent})")

    if state.estimated_seconds_used >= policy.effective_window_budget():
        return Decision("hold", "window utilization at target")

    week_budget = policy.weekly_budget_fraction * WEEK_SECONDS * policy.target_utilization
    if state.week_seconds_used >= week_budget:
        return Decision("hold", "weekly budget fraction exhausted")

    item = pick_item(queue, state.runs_by_item, state.noops_by_item)
    if item is None:
        return Decision("hold", "queue empty")

    model = policy.models[item.model_class]
    return Decision("start", f"start {item.id}", item=item, model=model)


def record_limit(state: BudgetState, now: float) -> BudgetState:
    state.last_limit_at = now
    return state


def record_auth_failure(state: BudgetState, now: float) -> BudgetState:
    state.last_auth_failure_at = now
    return state


def record_job_finished(state: BudgetState, duration_seconds: float) -> BudgetState:
    used = max(0.0, duration_seconds)
    state.estimated_seconds_used += used
    state.week_seconds_used += used
    return state


def record_job_started(state: BudgetState, item_id: str | None = None) -> BudgetState:
    state.jobs_started_this_window += 1
    if item_id:
        state.runs_by_item[item_id] = state.runs_by_item.get(item_id, 0) + 1
    return state


def state_to_dict(state: BudgetState) -> dict[str, Any]:
    return asdict(state)


def state_from_dict(raw: dict[str, Any] | None, now: float) -> BudgetState:
    data = raw or {}
    last = data.get("last_limit_at")
    last_auth = data.get("last_auth_failure_at")
    return BudgetState(
        window_started_at=float(data.get("window_started_at") or now),
        estimated_seconds_used=float(data.get("estimated_seconds_used") or 0),
        week_started_at=float(data.get("week_started_at") or now),
        week_seconds_used=float(data.get("week_seconds_used") or 0),
        last_limit_at=None if last is None else float(last),
        last_auth_failure_at=None if last_auth is None else float(last_auth),
        jobs_started_this_window=int(data.get("jobs_started_this_window") or 0),
        accounted_job_uids=[str(u) for u in (data.get("accounted_job_uids") or [])],
        runs_by_item={
            str(k): int(v) for k, v in (data.get("runs_by_item") or {}).items()
        },
        noops_by_item={
            str(k): int(v) for k, v in (data.get("noops_by_item") or {}).items()
        },
    )


def parse_rfc3339(value: str | None) -> float | None:
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def job_view_from_k8s(job: dict[str, Any], pods: Iterable[dict[str, Any]] = ()) -> JobView:
    meta = job.get("metadata") or {}
    status = job.get("status") or {}
    uid = str(meta.get("uid") or meta.get("name") or "")
    active = int(status.get("active") or 0)
    succeeded = int(status.get("succeeded") or 0) > 0
    failed = int(status.get("failed") or 0) > 0
    start = parse_rfc3339(status.get("startTime"))
    end = parse_rfc3339(status.get("completionTime"))
    duration = None
    if start is not None and end is not None and end >= start:
        duration = end - start
    job_name = str(meta.get("name") or "")
    item = str((meta.get("labels") or {}).get("governor.item") or "")
    limit_hit = False
    noop = False
    auth_failed = False
    for pod in pods:
        labels = (pod.get("metadata") or {}).get("labels") or {}
        if labels.get("job-name") != job_name:
            continue
        for container in (pod.get("status") or {}).get("containerStatuses") or []:
            terminated = ((container.get("state") or {}).get("terminated")) or {}
            exit_code = int(terminated.get("exitCode") or 0)
            message = str(terminated.get("message") or "")
            if exit_code == EXIT_LIMIT:
                limit_hit = True
            if parse_limit_error(message):
                limit_hit = True
            if exit_code == EXIT_NOOP or NOOP_MARKER in message:
                noop = True
            if exit_code == EXIT_AUTH or AUTH_MARKER in message:
                auth_failed = True
    # A run that hit a quota limit did not "produce nothing" for any reason the
    # queue can act on — it was cut off. Damping the item for that would punish
    # it for the fleet's budget, and the limit cooldown already handles it.
    #
    # A rejected credential is the same shape of non-answer, and additionally
    # must not be mistaken for a limit: `parse_limit_error` scans the
    # termination message, and "401 unauthorized" is a substring away from
    # phrases it matches. Whichever signal the pod carried, the credential
    # verdict wins — an hour's limit cooldown is the wrong remedy for a login
    # that expired, which is the whole reason worker.sh spends a separate exit
    # code on it.
    if limit_hit or auth_failed:
        noop = False
    if auth_failed:
        limit_hit = False
    return JobView(
        uid=uid,
        active=active,
        succeeded=succeeded,
        failed=failed,
        duration_seconds=duration,
        limit_hit=limit_hit,
        item=item,
        noop=noop,
        auth_failed=auth_failed,
    )


def count_running(jobs: Iterable[JobView]) -> int:
    return sum(job.active for job in jobs)


def absorb_finished_jobs(state: BudgetState, jobs: Iterable[JobView], now: float) -> BudgetState:
    seen = set(state.accounted_job_uids)
    for job in jobs:
        if not job.uid or job.uid in seen:
            continue
        if job.active:
            continue
        if not (job.succeeded or job.failed):
            continue
        if job.duration_seconds:
            record_job_finished(state, job.duration_seconds)
        if job.limit_hit:
            record_limit(state, now)
        if job.auth_failed:
            record_auth_failure(state, now)
        # Only a run that reached its own end tells us anything about whether
        # the item still has work. A crash, an OOM kill or a rejected
        # credential says nothing about the queue, so it neither damps the item
        # nor clears an existing damping.
        if job.item and (job.noop or job.succeeded):
            if job.noop:
                state.noops_by_item[job.item] = min(
                    state.noops_by_item.get(job.item, 0) + 1, MAX_NOOP_DAMPING
                )
            else:
                state.noops_by_item.pop(job.item, None)
        seen.add(job.uid)
        state.accounted_job_uids.append(job.uid)
    if len(state.accounted_job_uids) > 200:
        state.accounted_job_uids = state.accounted_job_uids[-200:]
    return state


def tick(
    policy: Policy,
    state: BudgetState,
    jobs: Iterable[JobView],
    queue: Iterable[QueueItem],
    now: float,
) -> tuple[Decision, BudgetState]:
    jobs = list(jobs)
    queue = list(queue)
    state = absorb_finished_jobs(state, jobs, now)
    state = rollover(state, now, policy)
    state = prune_noops(state, queue)
    decision = decide(policy, state, count_running(jobs), queue, now)
    if decision.action == "start":
        record_job_started(state, decision.item.id if decision.item else None)
    return decision, state


def build_job_manifest(
    item: QueueItem,
    model: str,
    *,
    now: float,
    namespace: str = "agents",
) -> dict[str, Any]:
    stamp = int(now)
    name = f"codex-{_dns1123(item.id)}-{stamp}"[:63].rstrip("-")
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": name,
            "namespace": namespace,
            "labels": {
                "app.kubernetes.io/name": "codex-worker",
                "app.kubernetes.io/part-of": "hel1-gitops",
                "governor.item": _dns1123(item.id),
            },
        },
        "spec": {
            "ttlSecondsAfterFinished": 86400,
            "backoffLimit": 0,
            "template": {
                "metadata": {
                    "labels": {
                        "app.kubernetes.io/name": "codex-worker",
                        "governor.item": _dns1123(item.id),
                    }
                },
                "spec": {
                    "restartPolicy": "Never",
                    "automountServiceAccountToken": False,
                    "serviceAccountName": "codex-worker",
                    "priorityClassName": "agents-low",
                    "nodeSelector": {"hcloud/node-role": "agents"},
                    "tolerations": [
                        {
                            "key": "dedicated",
                            "operator": "Equal",
                            "value": "agents",
                            "effect": "NoSchedule",
                        }
                    ],
                    # Every other workload in this repo (portfolio-site's three
                    # containers, its refresh and usage CronJobs, the governor
                    # CronJob itself, the CI runner) sets a securityContext. This
                    # Job -- the one actually holding the Codex/GitHub credentials
                    # from `codex-secrets` -- never did; nothing here narrowed it.
                    #
                    # `allowPrivilegeEscalation: false` and a RuntimeDefault
                    # seccomp profile cost nothing and close the same class of
                    # hole every sibling workload already closes: they only stop
                    # this container from gaining *more* than it starts with, and
                    # worker.sh never execs a setuid binary to escalate through.
                    #
                    # `capabilities.drop: ["ALL"]`, `runAsNonRoot` and
                    # `readOnlyRootFilesystem` are deliberately NOT set, unlike
                    # every sibling above. `worker.sh`'s `install_tools()` runs
                    # `apt-get install` against the base `node:22-bookworm` image
                    # (root, not started as a fixed non-root UID) to add `gh` and
                    # `git`, and dpkg's maintainer scripts for a fresh install can
                    # need capabilities beyond the ones a dropped-to-ALL root
                    # process retains (CAP_CHOWN, CAP_SETUID/CAP_SETGID for the
                    # packages that provision a system user). `npm install -g` and
                    # the clone into `mktemp -d` both write outside the two
                    # read-only mounts below, so the root filesystem cannot be
                    # read-only either. Narrowing those three needs a prebuilt
                    # image with `gh`/`git`/`codex` baked in and a fixed non-root
                    # user -- a bigger change than this fix.
                    "securityContext": {
                        "seccompProfile": {"type": "RuntimeDefault"},
                    },
                    "containers": [
                        {
                            "name": "codex",
                            "image": "node:22-bookworm",
                            "command": ["bash", "/opt/worker/worker.sh"],
                            "env": [
                                {"name": "QUEUE_ITEM_JSON", "value": json.dumps(item.__dict__)},
                                {"name": "AGENT_MODEL", "value": model},
                                {"name": "CODEX_LIMIT_EXIT", "value": str(EXIT_LIMIT)},
                                {"name": "CODEX_NOOP_EXIT", "value": str(EXIT_NOOP)},
                                # worker.sh defaulted this to 43 on its own
                                # while nothing on this side knew the number,
                                # which is how the two drifted apart in the
                                # first place. Passing it makes the contract
                                # one-sided in git rather than agreed by
                                # coincidence.
                                {"name": "CODEX_AUTH_EXIT", "value": str(EXIT_AUTH)},
                            ],
                            "envFrom": [{"secretRef": {"name": "codex-secrets", "optional": True}}],
                            "volumeMounts": [
                                {"name": "worker", "mountPath": "/opt/worker", "readOnly": True},
                                # Codex refreshes its subscription credential on
                                # use and the old refresh token stops working.
                                # Without somewhere to keep the refreshed file,
                                # the sealed Secret goes stale after the first
                                # Job and every later run fails to authenticate.
                                {"name": "codex-home", "mountPath": "/var/lib/codex"},
                            ],
                            "securityContext": {
                                "allowPrivilegeEscalation": False,
                            },
                            "resources": {
                                "requests": {"cpu": "500m", "memory": "1Gi"},
                                "limits": {"cpu": "1500m", "memory": "3Gi"},
                            },
                        }
                    ],
                    "volumes": [
                        {"name": "worker", "configMap": {"name": "codex-worker-script", "defaultMode": 0o555}},
                        {"name": "codex-home", "persistentVolumeClaim": {"claimName": "codex-home"}},
                    ],
                },
            },
        },
    }


def _dns1123(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9-]", "-", value.lower())
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "item"


# --- in-cluster wrapper (not used by unit tests) -------------------------

def _incluster() -> tuple[str, dict[str, str], ssl.SSLContext]:
    host = os.environ["KUBERNETES_SERVICE_HOST"]
    port = os.environ["KUBERNETES_SERVICE_PORT"]
    sa = Path("/var/run/secrets/kubernetes.io/serviceaccount")
    token = (sa / "token").read_text().strip()
    ctx = ssl.create_default_context(cafile=str(sa / "ca.crt"))
    return f"https://{host}:{port}", {"Authorization": f"Bearer {token}"}, ctx


def _k8s(method: str, path: str, body: dict[str, Any] | None = None) -> tuple[int, Any]:
    base, headers, ctx = _incluster()
    data = None
    req_headers = dict(headers)
    if body is not None:
        data = json.dumps(body).encode()
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        payload: Any
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"message": raw.decode("utf-8", "replace")}
        return exc.code, payload


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    text = path.read_text()
    if not text.strip():
        return None
    return json.loads(text)


def _load_queue_dir(path: Path) -> list[QueueItem]:
    items: list[QueueItem] = []
    if not path.exists():
        return items
    for file in sorted(path.iterdir()):
        if file.suffix not in {".yaml", ".yml", ".json"}:
            continue
        raw_text = file.read_text()
        if file.suffix == ".json":
            raw = json.loads(raw_text)
        else:
            raw = _minimal_yaml_mapping(raw_text)
        if isinstance(raw, dict):
            try:
                items.append(queue_item_from_dict(raw))
            except ValueError:
                continue
    return items


def _minimal_yaml_mapping(text: str) -> dict[str, Any]:
    """Tiny YAML subset so the image needs no PyYAML: key: value, and a
    literal block for `prompt: |`."""
    data: dict[str, Any] = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        if ":" not in line:
            i += 1
            continue
        key, _, rest = line.partition(":")
        key = key.strip()
        rest = rest.strip()
        if rest in ("|", ">"):
            block: list[str] = []
            i += 1
            while i < len(lines) and (lines[i].startswith("  ") or lines[i].strip() == ""):
                block.append(lines[i][2:] if lines[i].startswith("  ") else "")
                i += 1
            data[key] = "\n".join(block).rstrip("\n")
            continue
        if rest.lower() in {"true", "false"}:
            data[key] = rest.lower() == "true"
        elif re.fullmatch(r"-?\d+", rest):
            data[key] = int(rest)
        elif re.fullmatch(r"-?\d+\.\d+", rest):
            data[key] = float(rest)
        else:
            data[key] = rest.strip("\"'")
        i += 1
    return data


def _load_cluster_jobs(namespace: str) -> list[JobView]:
    jobs_code, jobs_payload = _k8s(
        "GET",
        f"/apis/batch/v1/namespaces/{namespace}/jobs"
        "?labelSelector=app.kubernetes.io/name%3Dcodex-worker",
    )
    if jobs_code != 200:
        print(f"list jobs failed: {jobs_code} {jobs_payload}", file=sys.stderr)
        return []
    pods_code, pods_payload = _k8s("GET", f"/api/v1/namespaces/{namespace}/pods")
    pods = pods_payload.get("items", []) if pods_code == 200 else []
    return [job_view_from_k8s(job, pods) for job in jobs_payload.get("items", [])]


def _load_state(namespace: str, cm_name: str, file_path: Path, now: float) -> tuple[BudgetState, dict[str, Any] | None]:
    if os.environ.get("KUBERNETES_SERVICE_HOST") and cm_name:
        code, payload = _k8s("GET", f"/api/v1/namespaces/{namespace}/configmaps/{cm_name}")
        if code == 200:
            raw = {}
            blob = (payload.get("data") or {}).get("state.json")
            if blob:
                try:
                    raw = json.loads(blob)
                except json.JSONDecodeError:
                    raw = {}
            return state_from_dict(raw, now), payload
    return state_from_dict(_read_json(file_path) or {}, now), None


def _save_state(
    state: BudgetState,
    namespace: str,
    cm_name: str,
    file_path: Path,
    existing: dict[str, Any] | None,
) -> bool:
    """Persist the budget counters. Returns False if the cluster write failed.

    The return value matters because a lost write is not cosmetic: the next
    tick reloads whatever is still in the ConfigMap, so a silent failure means
    the seconds just spent are never counted against the window.
    """
    blob = json.dumps(state_to_dict(state), separators=(",", ":"))
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(blob)
    if not (os.environ.get("KUBERNETES_SERVICE_HOST") and cm_name):
        return True
    body = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": cm_name,
            "namespace": namespace,
        },
        "data": {"state.json": blob},
    }
    if existing and (existing.get("metadata") or {}).get("resourceVersion"):
        body["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
        code, payload = _k8s("PUT", f"/api/v1/namespaces/{namespace}/configmaps/{cm_name}", body)
    else:
        # Create goes to the collection endpoint, not the per-name one: the API
        # server has no route for POST .../configmaps/{cm_name} (that 404s) and
        # would otherwise leave the very first tick's budget state unpersisted,
        # silently, forever, since the code below never checked the response.
        code, payload = _k8s("POST", f"/api/v1/namespaces/{namespace}/configmaps", body)
    if code not in (200, 201):
        print(f"save state failed: {code} {payload}", file=sys.stderr)
        return False
    return True


def main(argv: list[str] | None = None) -> int:
    del argv
    policy_path = Path(os.environ.get("GOVERNOR_POLICY", "/etc/governor/policy.json"))
    state_path = Path(os.environ.get("GOVERNOR_STATE", "/var/run/governor/state.json"))
    queue_dir = Path(os.environ.get("GOVERNOR_QUEUE", "/etc/governor/queue"))
    namespace = os.environ.get("GOVERNOR_NAMESPACE", "agents")
    state_cm = os.environ.get("GOVERNOR_STATE_CONFIGMAP", "governor-state")

    policy = policy_from_dict(_read_json(policy_path) or {})
    now = time.time()
    state, existing_cm = _load_state(namespace, state_cm, state_path, now)
    queue = _load_queue_dir(queue_dir)
    jobs: list[JobView] = []
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        jobs = _load_cluster_jobs(namespace)

    decision, state = tick(policy, state, jobs, queue, now)

    # Fail closed when the budget counters could not be read from the cluster.
    #
    # _load_state only returns the ConfigMap payload when its GET returned 200,
    # so in-cluster + a configured state ConfigMap + existing_cm is None means
    # that GET did not succeed. It then fell back to `state_path`, which lives
    # on the pod's own filesystem and is empty on every fresh pod -- so `state`
    # here is a *blank* budget, not the real one.
    #
    # Left alone that reads as "0 seconds used, 0 jobs started this window" on
    # every single tick, and the 5-hour and weekly caps stop capping anything:
    # the governor would authorize another job every tick, forever. That is the
    # exact runaway this component exists to prevent, so an unreadable state
    # ConfigMap has to stop job creation rather than quietly widen the budget.
    #
    # Reachable two ways, both now that `create` is off the Role (#2276): the
    # ConfigMap is genuinely absent (namespace rebuilt, Argo app re-added, sync
    # not yet landed) and the GET 404s, or RBAC drifts and it 403s. Argo does
    # seed governor-state from governor/state.yaml, so this is the unhappy
    # path -- but it is the one where being wrong costs money.
    if (
        os.environ.get("KUBERNETES_SERVICE_HOST")
        and state_cm
        and existing_cm is None
        and decision.action == "start"
    ):
        decision = Decision(
            "hold",
            f"budget state unavailable: could not read configmap/{state_cm} "
            f"in {namespace}; refusing to start on an unverified budget",
        )
    print(
        json.dumps(
            {
                "action": decision.action,
                "reason": decision.reason,
                "model": decision.model,
                "window_used": state.estimated_seconds_used,
                "week_used": state.week_seconds_used,
            }
        )
    )

    created_ok = True
    if decision.action == "start" and decision.item is not None and decision.model is not None:
        manifest = build_job_manifest(decision.item, decision.model, now=now, namespace=namespace)
        if not os.environ.get("KUBERNETES_SERVICE_HOST"):
            print(json.dumps(manifest))
        else:
            code, payload = _k8s(
                "POST",
                f"/apis/batch/v1/namespaces/{namespace}/jobs",
                manifest,
            )
            print(
                json.dumps(
                    {
                        "created": code,
                        "name": manifest["metadata"]["name"],
                        "body": payload.get("reason") or payload.get("message"),
                    }
                )
            )
            created_ok = code in {200, 201}

    # A dropped state write leaves the seconds just spent uncounted, so surface
    # it as a failed tick: the CronJob shows up in `kubectl get jobs` as failed
    # instead of the budget quietly drifting behind reality.
    saved_ok = _save_state(state, namespace, state_cm, state_path, existing_cm)
    return 0 if (created_ok and saved_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
