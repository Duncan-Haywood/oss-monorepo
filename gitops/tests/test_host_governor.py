"""Tests for the host-mode Codex governor. No cluster, no token, no network.

The point of host mode is that it is the *same* scheduler as the CronJob with
a different I/O half, so most of these assert that equivalence rather than
re-testing arithmetic `test_governor.py` already covers.
"""

from __future__ import annotations

import importlib.util
import json
import os
import stat
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "agents"
HOST = AGENTS / "host" / "host_governor.py"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


hg = _load("host_governor_under_test", HOST)
g = hg._load_governor()


# --------------------------------------------------------------- environment


@pytest.fixture
def box(tmp_path, monkeypatch):
    """A fake host: its own state, lock, queue, policy and worker script."""
    queue = tmp_path / "queue"
    queue.mkdir()
    (queue / "item.json").write_text(
        json.dumps(
            {
                "id": "demo-item",
                "repo": "Duncan-Haywood/monorepo-projects",
                "prompt": "do the thing",
                "modelClass": "chore",
                "priority": 10,
                "enabled": True,
            }
        )
    )
    policy = tmp_path / "policy.json"
    policy.write_text(json.dumps({"enabled": True, "maxConcurrent": 1}))
    mandate = tmp_path / "mandate.md"
    mandate.write_text("mandate")

    monkeypatch.setenv("CODEX_HOST_STATE", str(tmp_path / "state.json"))
    monkeypatch.setenv("CODEX_HOST_LOCK", str(tmp_path / "tick.lock"))
    monkeypatch.setenv("CODEX_HOST_QUEUE", str(queue))
    monkeypatch.setenv("CODEX_HOST_POLICY", str(policy))
    monkeypatch.setenv("CODEX_HOST_MANDATE", str(mandate))
    return tmp_path


def install_worker(box: Path, body: str) -> Path:
    """Write a stub standing in for `worker.sh` and point host mode at it."""
    script = box / "worker.sh"
    script.write_text("#!/usr/bin/env bash\n" + textwrap.dedent(body))
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    os.environ["CODEX_HOST_WORKER"] = str(script)
    return script


# ------------------------------------------------------- the borrowed policy


def test_scheduling_logic_is_imported_not_restated():
    """Host mode must own no scheduling decision of its own.

    This repository has twice paid for a copied rule going stale (CLAUDE.md,
    "168 became 169"). The guard is crude on purpose: if a future edit adds a
    budget or picking rule here rather than to `governor.py`, one of these
    names shows up in this file and the test says so.
    """
    source = HOST.read_text()
    for owned_by_governor in (
        "def pick_item",
        "def decide",
        "def rollover",
        "def absorb_finished_jobs",
        "def record_job_finished",
        "def effective_window_budget",
        "WEEK_SECONDS =",
    ):
        assert owned_by_governor not in source, (
            f"host_governor.py defines {owned_by_governor!r}; import it from "
            "governor.py instead so the two cannot drift"
        )


def test_disabled_policy_holds(box):
    (box / "policy.json").write_text(json.dumps({"enabled": False}))
    decision, _ = hg.tick_once(g, dry_run=True)
    assert decision.action == "hold"
    assert decision.reason == "governor disabled"


def test_enabled_policy_picks_the_queue_item(box):
    decision, _ = hg.tick_once(g, dry_run=True)
    assert decision.action == "start"
    assert decision.item is not None
    assert decision.item.id == "demo-item"
    assert decision.model == "gpt-5-mini"


def test_dry_run_starts_nothing(box):
    marker = box / "ran"
    install_worker(box, f"""
        touch {marker}
        exit 0
    """)
    hg.tick_once(g, dry_run=True)
    assert not marker.exists()


# ------------------------------------------------------------ the worker run


def test_successful_run_is_credited_to_the_budget(box):
    install_worker(box, """
        sleep 0.2
        exit 0
    """)
    decision, state = hg.tick_once(g, dry_run=False)
    assert decision.action == "start"
    assert state.estimated_seconds_used > 0
    assert state.week_seconds_used > 0
    assert state.jobs_started_this_window == 1
    # A productive run clears any damping rather than adding to it.
    assert state.noops_by_item.get("demo-item", 0) == 0


def test_worker_receives_the_job_manifest_env(box):
    dump = box / "env.json"
    install_worker(box, f"""
        python3 - <<'PY'
        import json, os
        json.dump(dict(os.environ), open({str(dump)!r}, "w"))
        PY
    """)
    hg.tick_once(g, dry_run=False)
    env = json.loads(dump.read_text())

    item = json.loads(env["QUEUE_ITEM_JSON"])
    assert item["id"] == "demo-item"
    assert item["prompt"] == "do the thing"
    assert env["AGENT_MODEL"] == "gpt-5-mini"
    # The three exit codes are passed rather than left to worker.sh's own
    # defaults, for the reason build_job_manifest gives: the two sides drifted
    # once already when only one of them knew the number.
    assert env["CODEX_LIMIT_EXIT"] == str(g.EXIT_LIMIT)
    assert env["CODEX_NOOP_EXIT"] == str(g.EXIT_NOOP)
    assert env["CODEX_AUTH_EXIT"] == str(g.EXIT_AUTH)
    assert env["CODEX_TERMINATION_LOG"]
    assert env["CODEX_MANDATE_FILE"].endswith("mandate.md")


def test_env_matches_the_cluster_job(box):
    """Host mode and the Job must hand the worker the same variable names.

    Not the same *values* — the paths differ — but a name added to one side
    and not the other is exactly how a worker that runs in the cluster stops
    running on the host, silently, at the next tick.
    """
    dump = box / "env.json"
    install_worker(box, f"""
        python3 - <<'PY'
        import json, os
        json.dump(dict(os.environ), open({str(dump)!r}, "w"))
        PY
    """)
    hg.tick_once(g, dry_run=False)
    host_env = set(json.loads(dump.read_text()))

    item = g.queue_item_from_dict({"id": "x", "repo": "r", "prompt": "p"})
    manifest = g.build_job_manifest(item, "gpt-5-mini", now=0.0)
    container = manifest["spec"]["template"]["spec"]["containers"][0]
    job_env = {entry["name"] for entry in container["env"]}

    missing = job_env - host_env
    assert not missing, f"the Job sets {sorted(missing)} and host mode does not"


# ------------------------------------------------------- outcomes and limits


def test_noop_run_damps_the_item(box):
    install_worker(box, f"""
        printf 'codex-noop: nothing to do\\n' > "$CODEX_TERMINATION_LOG"
        exit {g.EXIT_NOOP}
    """)
    _, state = hg.tick_once(g, dry_run=False)
    assert state.noops_by_item.get("demo-item") == 1


def test_limit_run_opens_the_cooldown(box):
    install_worker(box, f"""
        exit {g.EXIT_LIMIT}
    """)
    _, state = hg.tick_once(g, dry_run=False)
    assert state.last_limit_at is not None
    # Cut off by the budget, not empty of work — damping it would punish the
    # item for the fleet's quota.
    assert "demo-item" not in state.noops_by_item


def test_auth_failure_opens_the_long_cooldown_and_is_not_a_limit(box):
    install_worker(box, f"""
        printf 'codex-auth-rejected: 401 unauthorized\\n' > "$CODEX_TERMINATION_LOG"
        exit {g.EXIT_AUTH}
    """)
    _, state = hg.tick_once(g, dry_run=False)
    assert state.last_auth_failure_at is not None
    assert state.last_limit_at is None
    assert "demo-item" not in state.noops_by_item


def test_cooldown_is_honoured_on_the_next_tick(box):
    install_worker(box, f"exit {g.EXIT_LIMIT}\n")
    hg.tick_once(g, dry_run=False)
    state_path = Path(os.environ["CODEX_HOST_STATE"])
    _, state = hg.tick_once(g, dry_run=False)
    g._save_state(state, "", "", state_path, None)

    decision, _ = hg.tick_once(g, dry_run=True)
    assert decision.action == "hold"


def test_timeout_is_recorded_as_a_failure_not_a_noop(box, monkeypatch):
    monkeypatch.setenv("CODEX_HOST_JOB_TIMEOUT", "1")
    install_worker(box, """
        sleep 30
    """)
    _, state = hg.tick_once(g, dry_run=False)
    # A wedged run must surface, not sink behind a damped score.
    assert "demo-item" not in state.noops_by_item
    assert state.estimated_seconds_used > 0


# ------------------------------------------------------------------ the lock


def test_second_tick_is_refused_while_one_holds_the_lock(box):
    with hg.TickLock(hg.lock_file()):
        with pytest.raises(hg.Locked):
            with hg.TickLock(hg.lock_file()):
                pass


def test_cli_reports_locked_rather_than_running_twice(box):
    install_worker(box, "exit 0\n")
    with hg.TickLock(hg.lock_file()):
        assert hg.main(["--once"]) == hg.EX_LOCKED


def test_check_mode_exits_zero_and_writes_no_state(box):
    state_path = Path(os.environ["CODEX_HOST_STATE"])
    assert hg.main(["--check"]) == 0
    assert not state_path.exists()


# ---------------------------------------------------------- state round-trip


def test_budget_survives_a_restart(box):
    install_worker(box, "sleep 0.2\nexit 0\n")
    assert hg.main(["--once"]) == 0
    first = json.loads(Path(os.environ["CODEX_HOST_STATE"]).read_text())
    assert first["estimated_seconds_used"] > 0

    assert hg.main(["--once"]) == 0
    second = json.loads(Path(os.environ["CODEX_HOST_STATE"]).read_text())
    assert second["estimated_seconds_used"] > first["estimated_seconds_used"]
    assert second["jobs_started_this_window"] == 2


def test_two_runs_in_one_second_are_both_charged(box):
    """Regression: the job uid was `int(now)`-derived and so collided.

    `absorb_finished_jobs` dedupes on the uid, so two runs inside the same
    wall-clock second were absorbed as one and the second run's seconds were
    never charged to the window — silently, exactly the lost-accounting
    failure `_save_state` documents on the cluster side. The timer's five
    minute interval hides it in production, which is what makes it worth a
    test rather than a comment.
    """
    install_worker(box, "exit 0\n")
    frozen = 1_756_000_000.0
    first = hg.run_worker(g, g.queue_item_from_dict(
        {"id": "demo-item", "repo": "r", "prompt": "p"}), "gpt-5-mini", now=frozen)
    second = hg.run_worker(g, g.queue_item_from_dict(
        {"id": "demo-item", "repo": "r", "prompt": "p"}), "gpt-5-mini", now=frozen)
    assert first.uid != second.uid

    state = g.state_from_dict({}, frozen)
    state = g.absorb_finished_jobs(state, [first, second], frozen)
    assert len(state.accounted_job_uids) == 2


def test_module_runs_as_a_script(box):
    """The systemd unit calls it as a program, not as an import."""
    install_worker(box, "exit 0\n")
    result = subprocess.run(
        [sys.executable, str(HOST), "--check"],
        capture_output=True,
        text=True,
        env=dict(os.environ),
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert "decision:" in result.stdout
