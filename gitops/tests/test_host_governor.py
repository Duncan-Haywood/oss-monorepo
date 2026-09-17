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


def test_protecthome_does_not_leave_worker_home_inaccessible():
    """`ProtectHome=true` makes /home, /root and /run/user inaccessible and
    *empty* for the unit's processes -- not merely read-only. worker.sh does
    not write to $HOME directly, but things it shells out to fall back to it
    when not told otherwise: `npm install -g` (install_codex) defaults its
    package cache to ~/.npm, and `gh` defaults its config to ~/.config/gh.

    This unit runs as root with no `User=`, so its real $HOME is /root --
    exactly the directory ProtectHome=true hides. Left unredirected, the
    first tick that actually reaches `install_codex` (a held tick, with no
    credentials yet, never does -- which is why this went unnoticed) fails
    outright on a write nobody sees coming.

    So: if ProtectHome is on, HOME must be pointed at a path this unit has
    *actually* declared writable -- one of ReadWritePaths -- rather than left
    to default to a directory ProtectHome hides.
    """
    unit = (HOST.parent / "codex-governor.service").read_text()
    settings: dict[str, str] = {}
    read_write_paths: list[str] = []
    for line in unit.splitlines():
        line = line.strip()
        if line.startswith("Environment="):
            name, _, value = line[len("Environment=") :].partition("=")
            settings[name] = value
        elif line.startswith("ProtectHome="):
            settings["ProtectHome"] = line.partition("=")[2]
        elif line.startswith("ReadWritePaths="):
            read_write_paths = line.partition("=")[2].split()

    if settings.get("ProtectHome", "").lower() not in ("1", "true", "yes"):
        pytest.skip("ProtectHome is not on; this unit's HOME is whatever the host gives it")

    home = settings.get("HOME")
    assert home, "ProtectHome=true hides /root, and no Environment=HOME= redirects it"
    assert any(home == p or home.startswith(p.rstrip("/") + "/") for p in read_write_paths), (
        f"HOME={home} is not inside any of ReadWritePaths={read_write_paths}; "
        "ProtectHome=true would make it inaccessible and empty"
    )


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


# ------------------------------------------------- the enable hint (#2026-09-17)
#
# `--check` is run on the box, by an operator who has just been told the
# governor is disabled, during the one session `HETZNERSSHKEY` buys. Until
# 2026-09-17 it answered "to turn it on: ./bootstrap/scripts/
# enable-codex-governor.sh" unconditionally -- a script that is not part of
# the installer's PAYLOAD, so it is not on the box, and that edits a
# *checkout's* policy, which this timer never reads. README.md says so in as
# many words: it "was never the right shape for a box whose policy arrives by
# `install -m 0644`". The hint pointed the reader away from the one command
# that works, at the moment it was most expensive to be wrong.


def test_enable_hint_on_a_box_names_the_installer_not_the_repo_script(tmp_path):
    """A tree with no `bootstrap/` around it is a box, not a checkout.

    `hg` is loaded from the real checkout and would take the checkout branch,
    so this loads a second copy from a tree with no repo scripts around it --
    which is what `install-codex-host.sh` leaves on the box.
    """
    installed = tmp_path / "opt" / "codex-agents"
    (installed / "host").mkdir(parents=True)
    (installed / "governor").mkdir(parents=True)
    box_copy = installed / "host" / "host_governor.py"
    box_copy.write_bytes(HOST.read_bytes())
    box_hg = _load("host_governor_on_a_box", box_copy)
    hint = box_hg.enable_hint(installed / "governor" / "policy.json")

    assert "install-codex-host.sh --enable" in hint
    assert "enable-codex-governor.sh" in hint, (
        "the box hint should still name the repo script -- to say not to use "
        "it here, which is the confusion being corrected"
    )
    assert "Do NOT use bootstrap/scripts/enable-codex-governor.sh" in hint
    assert str(installed / "governor" / "policy.json") in hint, (
        "name the policy actually being read, so the operator can verify the "
        "flip landed on the right file"
    )


def test_enable_hint_does_not_invent_an_on_box_path_for_the_installer(tmp_path):
    """The installer is not in PAYLOAD, so no absolute path for it is honest.

    `restore-cluster.sh` untars it into a mktemp dir and `rm -rf`s that dir at
    the end of step 9. A hint naming `/opt/codex-agents/install-codex-host.sh`
    would name a file that is not there -- the same defect, respelled.
    """
    installed = tmp_path / "codex-agents"
    (installed / "host").mkdir(parents=True)
    box_copy = installed / "host" / "host_governor.py"
    box_copy.write_bytes(HOST.read_bytes())
    box_hg = _load("host_governor_no_invented_path", box_copy)
    hint = box_hg.enable_hint(installed / "governor" / "policy.json")

    assert str(installed / "install-codex-host.sh") not in hint
    assert "/opt/codex-agents/install-codex-host.sh" not in hint


def test_enable_hint_in_a_checkout_names_the_cluster_route():
    """In the repository, the commit-and-let-Argo-sync route is the right one."""
    hint = hg.enable_hint(hg.policy_file())
    assert "./bootstrap/scripts/enable-codex-governor.sh" in hint
    assert "checkout" in hint
    assert "install-codex-host.sh --enable" in hint, (
        "a checkout reader is often about to act on a box; say what the flip "
        "is there too"
    )


def test_the_payload_really_does_not_carry_the_installer():
    """Pins the fact both hints are written against."""
    installer = ROOT.parent / "bootstrap" / "scripts" / "install-codex-host.sh"
    payload = installer.read_text().split("PAYLOAD=(", 1)[1].split(")", 1)[0]
    assert "install-codex-host.sh" not in payload, (
        "if the installer ever installs itself, the box hint can name its "
        "absolute path -- update enable_hint() and this test together"
    )


# ------------------------------------------------------------- the queue report
#
# Added 2026-09-17. `--check` is the read-only preview an operator runs on the
# box during the one SSH session this recovery gets, and it could not see a
# queue that will never run. Two routes to that, both measured against the six
# real items:
#
#   all six `enabled: false`   -> 6 files, 0 runnable. `decide` filters on
#                                 `enabled`, so the timer reports
#                                 `hold -- queue empty` and exits 0 forever.
#   one `modelClass: Deep`     -> 6 files, 4 loaded. `_load_queue_dir` swallows
#                                 the ValueError per file and moves on, and the
#                                 two dropped were deploy-cicd-readiness and
#                                 marketing-distribution, the highest-priority
#                                 items in the queue.
#
# In both cases every visible signal was green: the file count stayed six, the
# unit was active, `systemctl status` was clean, and the decision line said only
# "governor disabled" because `decide` returns before it looks at the queue --
# which is the state every pre-install rehearsal is in by definition.


def _queue_dir(tmp_path: Path, items: list[dict]) -> Path:
    queue = tmp_path / "q"
    queue.mkdir()
    for i, raw in enumerate(items):
        (queue / f"item{i}.json").write_text(json.dumps(raw))
    return queue


def _item(**over) -> dict:
    base = {
        "id": "demo",
        "repo": "o/r",
        "prompt": "p",
        "modelClass": "chore",
        "priority": 1,
        "enabled": True,
    }
    base.update(over)
    return base


def test_queue_report_counts_runnable_not_files(tmp_path) -> None:
    queue = _queue_dir(
        tmp_path,
        [_item(id="live", priority=7), _item(id="off", enabled=False)],
    )
    lines, runnable = hg.queue_report(g, queue)
    body = "\n".join(lines)
    assert runnable == 1
    assert "2 file(s), 1 runnable, 1 disabled, 0 unreadable" in body
    assert "+ live (priority 7, chore)" in body
    assert "disabled: off" in body
    assert "NOTHING WOULD RUN" not in body


def test_queue_report_says_nothing_would_run_when_every_item_is_disabled(tmp_path) -> None:
    queue = _queue_dir(
        tmp_path, [_item(id="a", enabled=False), _item(id="b", enabled=False)]
    )
    lines, runnable = hg.queue_report(g, queue)
    assert runnable == 0
    assert "NOTHING WOULD RUN" in "\n".join(lines)


def test_queue_report_names_the_item_the_governor_drops(tmp_path) -> None:
    """The reason, and the filename. An operator cannot fix what is only counted."""
    queue = _queue_dir(tmp_path, [_item(id="fine"), _item(id="typo", modelClass="Deep")])
    lines, runnable = hg.queue_report(g, queue)
    body = "\n".join(lines)
    assert runnable == 1
    assert "1 unreadable" in body
    assert "item1.json" in body
    assert "unsupported modelClass: Deep" in body


def test_queue_report_is_not_fooled_by_an_empty_or_absent_directory(tmp_path) -> None:
    lines, runnable = hg.queue_report(g, tmp_path / "nope")
    assert runnable == 0 and "nothing at" in "\n".join(lines)
    empty = tmp_path / "empty"
    empty.mkdir()
    lines, runnable = hg.queue_report(g, empty)
    assert runnable == 0 and "every tick will hold" in "\n".join(lines)


def test_check_reports_the_queue_even_while_the_policy_is_off(box, capsys) -> None:
    """The regression that motivated all of the above.

    `decide` short-circuits on a disabled policy, so before this the whole
    report for an un-enabled box was two lines about the switch. The queue is
    the half the operator cannot re-check without a second session, so it has
    to print here even though -- especially though -- the governor is off.
    """
    (box / "policy.json").write_text(json.dumps({"enabled": False}))
    assert hg.main(["--check"]) == 0
    out = capsys.readouterr().out
    assert "governor disabled" in out
    assert "queue:" in out
    assert "demo-item" in out


def test_require_runnable_exits_1_only_while_nothing_would_run(box, monkeypatch, capsys) -> None:
    # The live queue the fixture builds: reports, exits 0.
    assert hg.main(["--check", "--require-runnable"]) == 0
    capsys.readouterr()

    # Same box, every item switched off. A reminder competes with everything
    # else in a long report; an exit code does not.
    dead = box / "dead"
    dead.mkdir()
    (dead / "i.json").write_text(json.dumps(_item(enabled=False)))
    monkeypatch.setenv("CODEX_HOST_QUEUE", str(dead))
    assert hg.main(["--check", "--require-runnable"]) == 1
    assert "NOTHING WOULD RUN" in capsys.readouterr().out


def test_queue_mode_needs_no_policy_and_no_state(tmp_path, monkeypatch, capsys) -> None:
    """What `install-codex-host.sh --check` calls, on a box that has neither yet."""
    queue = _queue_dir(tmp_path, [_item(id="only", priority=3)])
    monkeypatch.setenv("CODEX_HOST_QUEUE", str(queue))
    monkeypatch.setenv("CODEX_HOST_POLICY", str(tmp_path / "absent-policy.json"))
    monkeypatch.setenv("CODEX_HOST_STATE", str(tmp_path / "absent-state.json"))
    assert hg.main(["--queue"]) == 0
    out = capsys.readouterr().out
    assert "+ only (priority 3, chore)" in out
    # It must not have written the state file it was pointed at.
    assert not (tmp_path / "absent-state.json").exists()


def test_require_runnable_is_rejected_outside_a_reporting_mode(capsys) -> None:
    assert hg.main(["--once", "--require-runnable"]) == 2
    assert "applies to --check and --queue" in capsys.readouterr().err
