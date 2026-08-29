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


def test_job_mounts_the_persistent_codex_home() -> None:
    # Codex rotates the plan credential on use. Without a volume the refreshed
    # auth.json dies with the pod and every later Job re-presents a spent
    # refresh token, which looks like "the login broke" and is not recoverable
    # from inside the cluster.
    manifest = g.build_job_manifest(_item(), "gpt-5-mini", now=NOW)
    spec = manifest["spec"]["template"]["spec"]
    volume = [v for v in spec["volumes"] if v["name"] == "codex-home"][0]
    assert volume["persistentVolumeClaim"]["claimName"] == "codex-home"
    mount = [
        m for m in spec["containers"][0]["volumeMounts"] if m["name"] == "codex-home"
    ][0]
    assert mount["mountPath"] == "/var/lib/codex"
    assert mount.get("readOnly") is not True


def test_delivery_defaults_to_the_harness_and_rejects_anything_else() -> None:
    assert g.queue_item_from_dict(
        {"id": "a", "repo": "o/r", "prompt": "p"}
    ).delivery == "harness"
    assert g.queue_item_from_dict(
        {"id": "a", "repo": "o/r", "prompt": "p", "delivery": "agent"}
    ).delivery == "agent"
    with pytest.raises(ValueError):
        g.queue_item_from_dict(
            {"id": "a", "repo": "o/r", "prompt": "p", "delivery": "whatever"}
        )


def test_delivery_reaches_the_worker_and_the_real_items_own_theirs() -> None:
    item = g.queue_item_from_dict(
        {"id": "a", "repo": "o/r", "prompt": "p", "delivery": "agent"}
    )
    manifest = g.build_job_manifest(item, "gpt-5-mini", now=NOW)
    env = {e["name"]: e["value"] for e in manifest["spec"]["template"]["spec"]["containers"][0]["env"]}
    assert json.loads(env["QUEUE_ITEM_JSON"])["delivery"] == "agent"

    # All three real items tell the agent to open its own PR and merge it, so
    # the harness must not also fold and open one.
    for name in (
        "branch-pr-drain.yaml",
        "seo-discoverability-audit.yaml",
        "product-feature-improvement.yaml",
    ):
        raw = g._minimal_yaml_mapping((AGENTS / "queue" / name).read_text())
        assert g.queue_item_from_dict(raw).delivery == "agent", name


def test_minimal_yaml_reads_prompt_block() -> None:
    text = (AGENTS / "queue" / "example.item.yaml").read_text()
    raw = g._minimal_yaml_mapping(text)
    item = g.queue_item_from_dict(raw)
    assert item.enabled is False
    assert item.id == "example-do-not-run"
    assert "Do not run" in item.prompt


def test_product_feature_improvement_queue_item_is_real_and_enabled() -> None:
    # This is the third real queue item the Hetzner Codex worker can run
    # once an owner seals codex-secrets and flips policy.enabled /
    # cronjob.suspend (decision-queue item agent-runner-subscription-login,
    # #2000). It must stay a valid, enabled item so that flip has real work
    # waiting once branch-pr-drain and seo-discoverability-audit are caught
    # up or disabled.
    text = (AGENTS / "queue" / "product-feature-improvement.yaml").read_text()
    raw = g._minimal_yaml_mapping(text)
    item = g.queue_item_from_dict(raw)
    assert item.id == "product-feature-improvement"
    assert item.enabled is True
    assert item.repo == "Duncan-Haywood/monorepo-projects"
    assert "gh pr create" not in item.prompt  # worker.sh itself runs `gh pr create`, not the prompt
    assert "merge it yourself" in item.prompt.lower()


def test_governor_queue_configmap_includes_all_real_items() -> None:
    kustomization = (AGENTS / "kustomization.yaml").read_text()
    for entry in (
        "branch-pr-drain.yaml=queue/branch-pr-drain.yaml",
        "seo-discoverability-audit.yaml=queue/seo-discoverability-audit.yaml",
        "product-feature-improvement.yaml=queue/product-feature-improvement.yaml",
    ):
        assert entry in kustomization


def test_real_queue_items_are_priority_ordered_pr_drain_then_seo_then_features() -> None:
    # pick_item always starts the single highest-priority enabled item and
    # never round-robins (see governor.py::pick_item), so with three
    # permanently-enabled items only the top one ever actually runs until a
    # human reprioritizes or disables it in git. Landing existing branch/PR
    # work and fixing discoverability metadata are cheaper and more bounded
    # than open-ended feature work, so they must stay ahead of it -- this
    # pins that ordering against an accidental priority edit.
    items = {
        raw["id"]: raw["priority"]
        for raw in (
            g._minimal_yaml_mapping((AGENTS / "queue" / name).read_text())
            for name in (
                "branch-pr-drain.yaml",
                "seo-discoverability-audit.yaml",
                "product-feature-improvement.yaml",
            )
        )
    }
    assert items["branch-pr-drain"] > items["seo-discoverability-audit"] > items["product-feature-improvement"]


def test_effective_window_budget_leaves_interactive_slack() -> None:
    policy = _policy(target_utilization=0.90, reserve_for_interactive=0.10)
    assert policy.effective_window_budget() == 16_200


def test_state_roundtrip() -> None:
    original = _state(estimated_seconds_used=120.5, accounted_job_uids=["a"])
    restored = g.state_from_dict(g.state_to_dict(original), NOW)
    assert restored.estimated_seconds_used == 120.5
    assert restored.accounted_job_uids == ["a"]
    assert restored.last_limit_at is None


def test_absorb_finished_job_counts_duration_once() -> None:
    state = _state()
    job = g.JobView(uid="job-1", succeeded=True, duration_seconds=600)
    state = g.absorb_finished_jobs(state, [job], NOW)
    state = g.absorb_finished_jobs(state, [job], NOW)
    assert state.estimated_seconds_used == 600
    assert state.week_seconds_used == 600
    assert state.accounted_job_uids == ["job-1"]


def test_absorb_limit_exit_sets_cooldown() -> None:
    state = _state()
    job = g.JobView(uid="job-429", failed=True, duration_seconds=90, limit_hit=True)
    state = g.absorb_finished_jobs(state, [job], NOW)
    assert state.last_limit_at == NOW
    decision = g.decide(_policy(), state, 0, [_item()], NOW)
    assert decision.action == "hold"
    assert "cooldown" in decision.reason


def test_job_view_reads_exit_42() -> None:
    job = {
        "metadata": {"uid": "u1", "name": "codex-task-1"},
        "status": {
            "active": 0,
            "failed": 1,
            "startTime": "2026-08-25T12:00:00Z",
            "completionTime": "2026-08-25T12:10:00Z",
        },
    }
    pods = [
        {
            "metadata": {"labels": {"job-name": "codex-task-1"}},
            "status": {
                "containerStatuses": [
                    {"state": {"terminated": {"exitCode": 42, "message": "limit reached"}}}
                ]
            },
        }
    ]
    view = g.job_view_from_k8s(job, pods)
    assert view.limit_hit is True
    assert view.failed is True
    assert view.duration_seconds == 600


def test_tick_starts_then_holds_while_active() -> None:
    policy = _policy()
    state = _state()
    decision, state = g.tick(policy, state, [], [_item()], NOW)
    assert decision.action == "start"
    assert state.jobs_started_this_window == 1
    active = [g.JobView(uid="running", active=1)]
    decision, _ = g.tick(policy, state, active, [_item(id="other")], NOW)
    assert decision.action == "hold"
