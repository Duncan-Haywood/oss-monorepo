#!/usr/bin/env python3
"""Codex governor, host mode: the same scheduler, run by systemd on the box.

Why this exists
---------------
`agents/governor/cronjob.yaml` runs the governor as a CronJob and each worker
as a Job, on the tainted `agents` node. That is the right shape when there is
a cluster. On 2026-09-04 there was not: `:6443` is refused on both boxes
(`Outage triage`, run 33889983086), so no CronJob ticks and no Job is created.

The same week, GitHub Actions ran out of metered minutes — every job comes
back `runner_id: 0` (`ci_starvation.py --run 33935905418`, 2026-09-05). So
both places this repository can execute code are down, and they are down for
unrelated reasons that happen to share a fix: the self-hosted runner stack
that exists as insurance against metered CI (`gitops/ci/`) runs *as pods in
the cluster*, which is the outage it was supposed to insure against.

This file is the third place, chosen because it is downstream of neither. The
boxes themselves are up — `:22` answers on both, per the same triage run — so
a systemd timer on the host runs when k3s does not and when Actions does not.
The Codex worker also spends the owner's ChatGPT subscription quota rather
than GitHub Actions minutes, so dev capacity here does not compete with the
allowance that is currently exhausted.

What it is not
--------------
Not a replacement for the CronJob, and not a fork of it. Every scheduling
decision still comes from `governor.py` — `tick`, `decide`, `pick_item`,
`rollover`, `absorb_finished_jobs`, the budget arithmetic and the outcome
precedence are imported, never restated. This module is only the I/O half the
CronJob does through the kube-apiserver: read policy and queue, run the
worker, persist the budget. If the two ever disagree about *when* to run
something, that is a bug here, not a policy difference.

That constraint is deliberate and this repository has paid for it twice: the
front-door mirror once copied `build.mjs`'s entry-point list instead of
importing it, and the copy went stale in a way that cost seven live pages
(CLAUDE.md, "168 became 169"). `test_host_governor.py` asserts this module
defines no scheduling logic of its own.

Running it
----------
    host_governor.py --check     # report what it would do, run nothing
    host_governor.py --once      # one tick (what the systemd timer calls)

Exit codes: 0 tick completed (whether it started a worker or held), 1 a real
error, 2 bad usage, 75 another instance holds the lock (EX_TEMPFAIL).
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
AGENTS = HERE.parent

EX_LOCKED = 75  # EX_TEMPFAIL: a tick is already in flight, try again next timer.


def _load_governor(path: Path | None = None) -> Any:
    """Import `governor.py` by path.

    `agents/` is not a Python package (the CronJob mounts the single file into
    a stock python image), so there is nothing to `import` by name. Loading it
    by location is what `gitops/tests/test_governor.py` already does.
    """
    target = path or (AGENTS / "governor" / "governor.py")
    spec = importlib.util.spec_from_file_location("hel1_governor", target)
    if not spec or not spec.loader:  # pragma: no cover - unreachable in-tree
        raise RuntimeError(f"cannot load governor from {target}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------- paths


def _env_path(name: str, default: str) -> Path:
    return Path(os.environ.get(name) or default)


def state_file() -> Path:
    return _env_path("CODEX_HOST_STATE", "/var/lib/codex-governor/state.json")


def lock_file() -> Path:
    return _env_path("CODEX_HOST_LOCK", "/var/lib/codex-governor/tick.lock")


def worker_script() -> Path:
    return _env_path("CODEX_HOST_WORKER", str(AGENTS / "workers" / "worker.sh"))


def queue_dir() -> Path:
    return _env_path("CODEX_HOST_QUEUE", str(AGENTS / "queue"))


def policy_file() -> Path:
    return _env_path("CODEX_HOST_POLICY", str(AGENTS / "governor" / "policy.json"))


def mandate_file() -> Path:
    return _env_path("CODEX_HOST_MANDATE", str(AGENTS / "workers" / "mandate.md"))


def job_timeout_seconds() -> int:
    """Wall-clock ceiling on one worker run.

    The Job has no `activeDeadlineSeconds`, because Kubernetes would evict a
    wedged pod on its own and the governor would see the failure. Nothing
    reaps a wedged subprocess on a host, and with `maxConcurrent: 1` one hung
    run blocks the queue indefinitely — so host mode needs a deadline the
    cluster path can do without. An hour is well clear of a normal run and
    still bounds the damage to one timer interval's worth of queue.
    """
    raw = os.environ.get("CODEX_HOST_JOB_TIMEOUT") or "3600"
    try:
        value = int(raw)
    except ValueError:
        return 3600
    return value if value > 0 else 3600


# ---------------------------------------------------------------------- lock


class TickLock:
    """`flock` so two ticks cannot overlap.

    systemd already refuses to start a second instance of a `Type=oneshot`
    service while one is active, so in the timer's own path this never
    contends. It is here for the other callers: an operator running `--once`
    by hand while the timer fires, or a second copy installed by mistake.
    Without it both would run a worker and both would write the budget file,
    and the second write would lose the first run's seconds — the same
    silently-uncounted-budget failure `_save_state` documents on the cluster
    side.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._fh = None

    def __enter__(self) -> "TickLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("w")
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self._fh.close()
            self._fh = None
            if exc.errno in (errno.EACCES, errno.EAGAIN):
                raise Locked() from exc
            raise
        return self

    def __exit__(self, *_exc: object) -> None:
        if self._fh is not None:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
            self._fh.close()
            self._fh = None


class Locked(RuntimeError):
    pass


# -------------------------------------------------------------------- worker


def worker_env(g: Any, item: Any, model: str, termination_log: Path) -> dict[str, str]:
    """The environment `worker.sh` is given, matching `build_job_manifest`.

    Every name here has a counterpart in the Job's `env`/`volumeMounts`. The
    three exit codes are passed rather than defaulted for the reason the
    manifest gives: worker.sh had its own defaults while the governor had its
    own constants, and the two drifted. The paths are the mount points the
    Job provides as volumes, which `worker.sh` already reads from overridable
    variables so that it can run outside a container.
    """
    env = dict(os.environ)
    env.update(
        {
            "QUEUE_ITEM_JSON": json.dumps(item.__dict__),
            "AGENT_MODEL": model,
            "CODEX_LIMIT_EXIT": str(g.EXIT_LIMIT),
            "CODEX_NOOP_EXIT": str(g.EXIT_NOOP),
            "CODEX_AUTH_EXIT": str(g.EXIT_AUTH),
            "CODEX_STATE_DIR": os.environ.get("CODEX_STATE_DIR") or "/var/lib/codex",
            "CODEX_TOOLS_DIR": os.environ.get("CODEX_TOOLS_DIR") or "/var/lib/codex-tools",
            "CODEX_TERMINATION_LOG": str(termination_log),
            "CODEX_MANDATE_FILE": str(mandate_file()),
        }
    )
    return env


def run_worker(g: Any, item: Any, model: str, *, now: float) -> Any:
    """Run one worker to completion and return it as a `JobView`.

    Synchronous on purpose. The cluster path is asynchronous because Jobs are,
    and the governor has to rediscover their outcome from the API on a later
    tick. Here the run is a child process, so its exit code and termination
    message are in hand the moment it ends and can be absorbed in this same
    tick — which removes the whole class of bug where a finished run is never
    credited because the record of it was lost between ticks.
    """
    script = worker_script()
    with tempfile.TemporaryDirectory(prefix="codex-tick-") as tmp:
        termination_log = Path(tmp) / "termination-log"
        termination_log.touch()
        started = time.monotonic()
        timed_out = False
        try:
            completed = subprocess.run(  # noqa: S603 - fixed script path, no shell
                ["bash", str(script)],
                env=worker_env(g, item, model, termination_log),
                timeout=job_timeout_seconds(),
                check=False,
            )
            exit_code = completed.returncode
        except subprocess.TimeoutExpired:
            timed_out = True
            exit_code = 124
        duration = time.monotonic() - started
        message = ""
        try:
            message = termination_log.read_text()
        except OSError:
            pass

    outcome = g.classify_outcome([(exit_code, message)])
    succeeded = exit_code == 0 or exit_code == g.EXIT_NOOP
    return g.JobView(
        # `absorb_finished_jobs` dedupes on this, so it has to be unique per
        # run and not merely per second. It was `int(now)` first, and the
        # round-trip test caught two runs inside one second collapsing into
        # one — the second run's seconds silently never charged to the budget,
        # which is the same lost-accounting failure `_save_state` guards on
        # the cluster side. Kubernetes hands the cluster path a real UID; here
        # there is nothing to borrow, so generate one.
        uid=f"host-{int(now)}-{g._dns1123(item.id)}-{uuid.uuid4().hex[:12]}",
        active=0,
        succeeded=succeeded,
        failed=not succeeded,
        duration_seconds=duration,
        limit_hit=outcome.limit_hit,
        # A run killed on the deadline is not a no-op: it produced no PR, but
        # not because the item had no work, and damping it for that would hide
        # a wedged item behind a low score instead of surfacing it.
        noop=outcome.noop and not timed_out,
        auth_failed=outcome.auth_failed,
        item=g._dns1123(item.id),
    )


# ---------------------------------------------------------------------- tick


def load_inputs(g: Any, now: float) -> tuple[Any, Any, list[Any]]:
    policy = g.policy_from_dict(g._read_json(policy_file()) or {})
    queue = g._load_queue_dir(queue_dir())
    state, _ = g._load_state("", "", state_file(), now)
    return policy, state, queue


def tick_once(g: Any, *, dry_run: bool, now: float | None = None) -> tuple[Any, Any]:
    """One governor tick. Returns `(decision, state)`.

    `running_count` is passed as 0 rather than measured. That is exact rather
    than optimistic: reaching this line means the flock was taken, and the
    lock is held for the whole of a synchronous run, so no other worker of
    ours can be in flight. `max_concurrent > 1` therefore cannot be honoured
    here and `main` says so out loud rather than quietly serialising.
    """
    now = time.time() if now is None else now
    policy, state, queue = load_inputs(g, now)
    decision, state = g.tick(policy, state, [], queue, now)

    if decision.action == "start" and not dry_run and decision.item is not None:
        view = run_worker(g, decision.item, decision.model or "", now=now)
        state = g.absorb_finished_jobs(state, [view], time.time())

    return decision, state


def describe(decision: Any, state: Any, policy: Any) -> str:
    lines = [f"decision: {decision.action} — {decision.reason}"]
    if decision.item is not None:
        lines.append(f"  item:  {decision.item.id} ({decision.item.model_class})")
        lines.append(f"  model: {decision.model}")
    if decision.sleep_seconds:
        lines.append(f"  sleep: {decision.sleep_seconds}s")
    lines.append(
        "budget: %.0fs of %.0fs this window, %.0fs this week"
        % (
            state.estimated_seconds_used,
            policy.effective_window_budget(),
            state.week_seconds_used,
        )
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="host_governor.py",
        description="Codex governor, host mode (systemd). Same scheduler as the CronJob.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--once",
        action="store_true",
        help="run one tick, starting a worker if the policy allows (default)",
    )
    mode.add_argument(
        "--check",
        action="store_true",
        help="report the decision and the budget; start nothing, write nothing",
    )
    args = parser.parse_args(argv)
    dry_run = bool(args.check)

    g = _load_governor()
    now = time.time()

    if dry_run:
        policy, state, queue = load_inputs(g, now)
        decision, _ = g.tick(policy, state, [], queue, now)
        print(describe(decision, state, policy))
        if not policy.enabled:
            print(
                "\nthe governor is disabled. To turn it on:\n"
                "  ./bootstrap/scripts/enable-codex-governor.sh"
            )
        return 0

    try:
        with TickLock(lock_file()):
            policy, _, _ = load_inputs(g, now)
            if policy.max_concurrent > 1:
                print(
                    f"note: policy maxConcurrent is {policy.max_concurrent}, but host "
                    "mode runs one worker per tick. Raising it has no effect here; "
                    "shorten the timer interval instead.",
                    file=sys.stderr,
                )
            decision, state = tick_once(g, dry_run=False, now=now)
            saved = g._save_state(state, "", "", state_file(), None)
            if not saved:  # pragma: no cover - the file path always returns True
                print("save state failed", file=sys.stderr)
                return 1
            print(describe(decision, state, policy))
    except Locked:
        print("another tick holds the lock; skipping this interval", file=sys.stderr)
        return EX_LOCKED
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
