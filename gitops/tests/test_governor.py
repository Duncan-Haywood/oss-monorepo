"""Pure-function tests for the Codex governor. No cluster, no token."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "agents"
_SPEC = importlib.util.spec_from_file_location(
    "hel1_governor", AGENTS / "governor" / "governor.py"
)
assert _SPEC and _SPEC.loader
g = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = g
_SPEC.loader.exec_module(g)


NOW = 1_700_000_000.0


def _policy(**kwargs) -> g.Policy:
    base = dict(
        enabled=True,
        max_concurrent=1,
        target_utilization=0.90,
        reserve_for_interactive=0.10,
        weekly_budget_fraction=0.85,
        window_seconds=18_000,
        cooldown_on_limit_seconds=3_600,
    )
    base.update(kwargs)
    return g.Policy(**base)


def _state(**kwargs) -> g.BudgetState:
    base = dict(
        window_started_at=NOW - 60,
        estimated_seconds_used=0.0,
        week_started_at=NOW - 60,
        week_seconds_used=0.0,
        last_limit_at=None,
        jobs_started_this_window=0,
    )
    base.update(kwargs)
    return g.BudgetState(**base)


def _item(**kwargs) -> g.QueueItem:
    base = dict(
        id="task-a",
        repo="Duncan-Haywood/monorepo-projects",
        prompt="do a small thing",
        model_class="chore",
        priority=10,
        enabled=True,
    )
    base.update(kwargs)
    return g.QueueItem(**base)


def test_disabled_never_starts() -> None:
    decision = g.decide(_policy(enabled=False), _state(), 0, [_item()], NOW)
    assert decision.action == "hold"
    assert "disabled" in decision.reason


def test_at_max_concurrent_holds() -> None:
    decision = g.decide(_policy(), _state(), 1, [_item()], NOW)
    assert decision.action == "hold"
    assert "running" in decision.reason


def test_recent_429_sleeps_instead_of_retry() -> None:
    state = _state(last_limit_at=NOW - 120)
    decision = g.decide(_policy(), state, 0, [_item()], NOW)
    assert decision.action == "hold"
    assert "cooldown" in decision.reason
    assert decision.sleep_seconds == 3_480


def test_cooldown_expires_then_starts() -> None:
    state = _state(last_limit_at=NOW - 3_601)
    decision = g.decide(_policy(), state, 0, [_item()], NOW)
    assert decision.action == "start"


def test_window_target_stops_before_100_percent() -> None:
    # usable window is min(0.90, 1-0.10) * 18000 = 16200
    state = _state(estimated_seconds_used=16_200)
    decision = g.decide(_policy(), state, 0, [_item()], NOW)
    assert decision.action == "hold"
    assert "window" in decision.reason


def test_weekly_fraction_stops_mid_week() -> None:
    week_budget = 0.85 * g.WEEK_SECONDS * 0.90
    state = _state(week_seconds_used=week_budget)
    decision = g.decide(_policy(), state, 0, [_item()], NOW)
    assert decision.action == "hold"
    assert "weekly" in decision.reason


def test_empty_queue_holds() -> None:
    decision = g.decide(_policy(), _state(), 0, [], NOW)
    assert decision.action == "hold"
    assert "empty" in decision.reason


def test_disabled_queue_item_is_not_picked() -> None:
    decision = g.decide(_policy(), _state(), 0, [_item(enabled=False)], NOW)
    assert decision.action == "hold"


def test_highest_priority_wins() -> None:
    low = _item(id="low", priority=1)
    high = _item(id="high", priority=50, model_class="deep")
    decision = g.decide(_policy(), _state(), 0, [low, high], NOW)
    assert decision.action == "start"
    assert decision.item is not None
    assert decision.item.id == "high"
    assert decision.model == "gpt-5"


def test_chore_uses_cheaper_model() -> None:
    decision = g.decide(_policy(), _state(), 0, [_item(model_class="chore")], NOW)
    assert decision.model == "gpt-5-mini"


def test_never_starts_two_when_max_is_one() -> None:
    policy = _policy(max_concurrent=1)
    first = g.decide(policy, _state(), 0, [_item()], NOW)
    second = g.decide(policy, _state(), 1, [_item(id="other")], NOW)
    assert first.action == "start"
    assert second.action == "hold"


def test_window_rollover_resets_usage() -> None:
    state = _state(
        window_started_at=NOW - 18_001,
        estimated_seconds_used=18_000,
        jobs_started_this_window=9,
    )
    rolled = g.rollover(state, NOW, _policy())
    assert rolled.estimated_seconds_used == 0
    assert rolled.jobs_started_this_window == 0
    assert rolled.window_started_at == NOW


def test_week_rollover_resets_week_usage() -> None:
    state = _state(week_started_at=NOW - g.WEEK_SECONDS - 1, week_seconds_used=99_999)
    rolled = g.rollover(state, NOW, _policy())
    assert rolled.week_seconds_used == 0


def test_parse_limit_error_variants() -> None:
    assert g.parse_limit_error("HTTP 429 Too Many Requests")
    assert g.parse_limit_error("you've hit your limit")
    assert g.parse_limit_error("Rate limit exceeded")
    assert g.parse_limit_error("usage limit reached")
    assert not g.parse_limit_error("tests passed, 0 failures")
    assert not g.parse_limit_error("")


def test_queue_item_rejects_incomplete() -> None:
    with pytest.raises(ValueError):
        g.queue_item_from_dict({"id": "x"})
    with pytest.raises(ValueError):
        g.queue_item_from_dict({"id": "x", "repo": "a/b", "prompt": "p", "modelClass": "sol"})


def test_policy_from_committed_json() -> None:
    raw = json.loads((AGENTS / "governor" / "policy.json").read_text())
    policy = g.policy_from_dict(raw)
    assert policy.enabled is False
    assert policy.max_concurrent == 1
    assert policy.target_utilization == 0.9
    assert policy.reserve_for_interactive == 0.1


def test_job_manifest_has_no_kube_token_and_pins_agent_node() -> None:
    manifest = g.build_job_manifest(_item(), "gpt-5-mini", now=NOW)
    spec = manifest["spec"]["template"]["spec"]
    assert spec["automountServiceAccountToken"] is False
    assert spec["nodeSelector"] == {"hcloud/node-role": "agents"}
    assert spec["priorityClassName"] == "agents-low"
    assert spec["containers"][0]["resources"]["limits"]["memory"] == "3Gi"
    env = {e["name"]: e["value"] for e in spec["containers"][0]["env"]}
    assert "kubeconfig" not in json.dumps(manifest).lower()
    assert json.loads(env["QUEUE_ITEM_JSON"])["id"] == "task-a"


def test_minimal_yaml_reads_prompt_block() -> None:
    text = (AGENTS / "queue" / "example.item.yaml").read_text()
    raw = g._minimal_yaml_mapping(text)
    item = g.queue_item_from_dict(raw)
    assert item.enabled is False
    assert item.id == "example-do-not-run"
    assert "Do not run" in item.prompt


def test_effective_window_budget_leaves_interactive_slack() -> None:
    policy = _policy(target_utilization=0.90, reserve_for_interactive=0.10)
    assert policy.effective_window_budget() == 16_200
