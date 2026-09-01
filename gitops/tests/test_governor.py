"""Pure-function tests for the Codex governor. No cluster, no token."""

from __future__ import annotations

import importlib.util
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
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


def test_job_narrows_what_it_can_without_breaking_apt_get() -> None:
    # Every sibling workload in this repo (portfolio-site's containers, its
    # CronJobs, the governor CronJob itself, the CI runner) sets a
    # securityContext; this Job -- the one actually holding the Codex/GitHub
    # credentials from `codex-secrets` -- never did.
    #
    # `capabilities.drop: ["ALL"]`, `runAsNonRoot` and `readOnlyRootFilesystem`
    # are deliberately absent: `worker.sh`'s `install_tools()` runs
    # `apt-get install` as root against the base `node:22-bookworm` image, and
    # `npm install -g` plus the `mktemp -d` clone both write outside the two
    # read-only mounts. This only pins the two fields that are safe regardless
    # -- neither needs root or a writable filesystem to hold.
    manifest = g.build_job_manifest(_item(), "gpt-5-mini", now=NOW)
    pod = manifest["spec"]["template"]["spec"]
    assert pod["securityContext"]["seccompProfile"]["type"] == "RuntimeDefault"
    assert pod["containers"][0]["securityContext"]["allowPrivilegeEscalation"] is False
    # Not asserting these is not the same as never having thought about them.
    assert "capabilities" not in pod["containers"][0]["securityContext"]
    assert "readOnlyRootFilesystem" not in pod["containers"][0]["securityContext"]
    assert "runAsNonRoot" not in pod["securityContext"]


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

    # All six real items own delivery themselves -- five open their own PR
    # and merge it, and open-pr-repair-merge pushes to a branch it did not
    # create -- so the harness must not also fold and open one.
    for name in (
        "open-pr-repair-merge.yaml",
        "branch-pr-drain.yaml",
        "deploy-cicd-readiness.yaml",
        "marketing-distribution.yaml",
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


def test_marketing_distribution_queue_item_is_real_and_bounded() -> None:
    # The queue's only item about how anyone *finds* the site.
    # seo-discoverability-audit improves how a page reads to a crawler that
    # already found it; nothing before this worked on reach, and for a
    # brand-new domain those run on different clocks.
    #
    # The assertions below are the safety boundary, not style. The mandate's
    # two absolute limits for this kind of work are that claims must be true
    # and that an agent never publishes outward -- putting the portfolio's
    # name on a public forum, directory or account is the owner's call and is
    # already in the decision queue. A marketing item is the one most likely
    # to drift across that line, and the drift would be discovered by
    # somebody seeing the post, so pin it here instead.
    text = (AGENTS / "queue" / "marketing-distribution.yaml").read_text()
    raw = g._minimal_yaml_mapping(text)
    item = g.queue_item_from_dict(raw)
    assert item.id == "marketing-distribution"
    assert item.enabled is True
    assert item.repo == "Duncan-Haywood/monorepo-projects"
    assert item.delivery == "agent"
    prompt = item.prompt.lower()
    assert "never publish" in prompt
    assert "must be true" in prompt
    # An asset that deploys, not a campaign document -- the failure mode this
    # item shares with every "do marketing" brief ever written.
    assert "do not produce a marketing plan" in prompt
    assert "merge it yourself" in prompt


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


def test_open_pr_repair_merge_queue_item_is_real_and_enabled() -> None:
    # The queue's drain. Every other real item ends by *opening* a PR, and
    # three of them route around PRs that already exist -- branch-pr-drain
    # takes only branches "not already covered by an open pull request", and
    # product-feature-improvement and seo-discoverability-audit each skip a
    # venture that already has one. So before this item existed, an open PR
    # that a run left un-merged was picked up by nothing, ever, and the
    # backlog could only grow. Assert the item stays real, enabled, and
    # pointed at merging rather than reviewing.
    text = (AGENTS / "queue" / "open-pr-repair-merge.yaml").read_text()
    raw = g._minimal_yaml_mapping(text)
    item = g.queue_item_from_dict(raw)
    assert item.id == "open-pr-repair-merge"
    assert item.enabled is True
    assert item.repo == "Duncan-Haywood/monorepo-projects"
    assert item.delivery == "agent"
    # supersede_check is the gate CLAUDE.md requires before any "already on
    # main" close; a prompt that drops it is how finished work got destroyed
    # here twice.
    assert "supersede_check.py" in item.prompt
    # The point of the item is the merge, not the review.
    assert "to merged" in item.prompt


def test_no_real_queue_item_leaves_open_prs_to_nobody() -> None:
    # The structural property, not just the one file: at least one enabled
    # real item must be about finishing PRs that already exist. If someone
    # disables or deletes open-pr-repair-merge without replacing it, the
    # fleet goes back to being net-PR-producing with no drain -- which is
    # the failure this item was added for and is invisible until a backlog
    # has already built up.
    real = [
        g.queue_item_from_dict(g._minimal_yaml_mapping((AGENTS / "queue" / name).read_text()))
        for name in (
            "open-pr-repair-merge.yaml",
            "branch-pr-drain.yaml",
            "deploy-cicd-readiness.yaml",
            "marketing-distribution.yaml",
            "seo-discoverability-audit.yaml",
            "product-feature-improvement.yaml",
        )
    ]
    drains = [
        item
        for item in real
        if item.enabled and "open pull request" in item.prompt and "supersede_check.py" in item.prompt
    ]
    assert drains, "no enabled queue item repairs and merges an already-open PR"


def test_seo_item_measures_its_backlog_instead_of_naming_one() -> None:
    # This item used to open with "the largest measured gap is FAQ content"
    # and send the run to faq-coverage.mjs as its default pick. That was true
    # when it was written and stopped being true once the backlog closed:
    # both coverage tools now report 169 of 169, so the pointer aimed at an
    # empty list and the run's choice was to flounder or invent a gap.
    #
    # The fix is the same one faq-coverage.mjs itself uses against drift --
    # read the current measurement rather than restate a past one -- so the
    # property to hold is that the prompt names both commands and asserts
    # neither is the larger backlog. A future revision that hard-codes the
    # ranking again fails here rather than silently a month later.
    text = (AGENTS / "queue" / "seo-discoverability-audit.yaml").read_text()
    item = g.queue_item_from_dict(g._minimal_yaml_mapping(text))
    assert item.id == "seo-discoverability-audit"
    assert item.enabled is True
    assert "faq-coverage.mjs" in item.prompt
    assert "guide-coverage.mjs" in item.prompt
    assert "Do not assume which\nbacklog is larger" in item.prompt
    # An item with nothing to do must be allowed to finish empty; the
    # governor's noop damping is what moves the budget off it. A prompt that
    # requires a change every run is how filler gets written.
    assert "change nothing" in item.prompt


def test_governor_queue_configmap_includes_all_real_items() -> None:
    kustomization = (AGENTS / "kustomization.yaml").read_text()
    for entry in (
        "open-pr-repair-merge.yaml=queue/open-pr-repair-merge.yaml",
        "branch-pr-drain.yaml=queue/branch-pr-drain.yaml",
        "deploy-cicd-readiness.yaml=queue/deploy-cicd-readiness.yaml",
        "seo-discoverability-audit.yaml=queue/seo-discoverability-audit.yaml",
        "product-feature-improvement.yaml=queue/product-feature-improvement.yaml",
    ):
        assert entry in kustomization


def test_real_queue_items_are_priority_ordered_deploy_then_marketing_then_drain() -> None:
    # pick_item weights `(priority + 1) / ((runs + 1) * (noops + 1))`, so this
    # ordering is what sets how often each item runs relative to the others
    # (roughly 8:7:6:5:4:3) and which one opens each window.
    #
    # **Reordered 2026-09-01** on the account owner's direction: "I want to
    # make sure deployment and cicd is a priority and building and deploying
    # marketing materials on the hetzner vms". `deploy-cicd-readiness` and
    # `marketing-distribution` took the top two slots from
    # `open-pr-repair-merge` and `branch-pr-drain`, which held them while the
    # PR/branch backlog was the bottleneck.
    #
    # It is not the bottleneck now -- the repo had zero open PRs on the day
    # this changed -- so those two were holding 13/25ths of the weight over
    # provably empty work. The `noops` damping corrects that eventually, but
    # only after spending the runs that discover it, and the first window
    # after an owner flips the governor on is the most valuable quota this
    # fleet will ever spend.
    #
    # The demotion is not a disabling: at 5 and 4 the two backlog items still
    # take 11/33 of the queue between them, and every item here opens and
    # merges its own PR (`delivery: agent`), so `open-pr-repair-merge` is the
    # safety net for a run whose verification did not come out clean rather
    # than the ordinary drain. Deployment stays above marketing for the
    # reason marketing-distribution.yaml always gave -- a distribution asset
    # for a site nobody can reach is worth less than the path that makes it
    # reachable -- and both stay above the two content items, whose backlogs
    # each report full coverage.
    #
    # This pins that six-way ordering against an accidental priority edit to
    # any one item. A deliberate reordering should change this assertion and
    # say, here, whose direction it came from.
    items = {
        raw["id"]: raw["priority"]
        for raw in (
            g._minimal_yaml_mapping((AGENTS / "queue" / name).read_text())
            for name in (
                "open-pr-repair-merge.yaml",
                "branch-pr-drain.yaml",
                "deploy-cicd-readiness.yaml",
                "marketing-distribution.yaml",
                "seo-discoverability-audit.yaml",
                "product-feature-improvement.yaml",
            )
        )
    }
    assert (
        items["deploy-cicd-readiness"]
        > items["marketing-distribution"]
        > items["open-pr-repair-merge"]
        > items["branch-pr-drain"]
        > items["seo-discoverability-audit"]
        > items["product-feature-improvement"]
    )
    # The demotion must stay a demotion and not become a disabling: at these
    # weights `open-pr-repair-merge` still opens roughly one run in five, which
    # is what keeps the drain a real safety net rather than a dead item.
    assert (items["open-pr-repair-merge"] + 1) / sum(p + 1 for p in items.values()) > 0.15


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


class _FakeApiServer:
    """Records every request `_k8s` makes and answers like the parts of the
    Kubernetes API that `_load_state`/`_save_state` touch: GET on a named
    ConfigMap, and PUT/POST for saving one.

    The real API server has no route for POST on a per-name resource path
    (creation only exists on the collection URL) -- unlike a naive stub that
    would happily 200 on any path, this one 404s exactly the way the cluster
    would, so a regression here fails the test instead of passing silently.
    """

    def __init__(self) -> None:
        self.requests: list[tuple[str, str]] = []
        self._configmap: dict | None = None
        server = self

        class Handler(BaseHTTPRequestHandler):
            def _body(self) -> dict:
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length else b""
                return json.loads(raw) if raw else {}

            def _reply(self, code: int, payload: dict) -> None:
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())

            def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
                server.requests.append(("GET", self.path))
                if server._configmap is None:
                    self._reply(404, {"message": "not found"})
                else:
                    self._reply(200, server._configmap)

            def do_POST(self) -> None:  # noqa: N802
                server.requests.append(("POST", self.path))
                collection = self.path.rsplit("/configmaps", 1)
                if len(collection) != 2 or collection[1] not in ("", "/"):
                    # Named-resource path: no such route on the real API server.
                    self._reply(404, {"message": "the server could not find the requested resource"})
                    return
                body = self._body()
                body.setdefault("metadata", {})["resourceVersion"] = "1"
                server._configmap = body
                self._reply(201, body)

            def do_PUT(self) -> None:  # noqa: N802
                server.requests.append(("PUT", self.path))
                if server._configmap is None:
                    self._reply(404, {"message": "not found"})
                    return
                body = self._body()
                body.setdefault("metadata", {})["resourceVersion"] = "2"
                server._configmap = body
                self._reply(200, body)

            def log_message(self, *args) -> None:  # silence test output
                pass

        self._httpd = HTTPServer(("127.0.0.1", 0), Handler)
        self.port = self._httpd.server_address[1]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def close(self) -> None:
        self._httpd.shutdown()
        self._thread.join(timeout=5)


@pytest.fixture
def fake_api_server(monkeypatch):
    server = _FakeApiServer()
    monkeypatch.setattr(
        g, "_incluster", lambda: (f"http://127.0.0.1:{server.port}", {}, None)
    )
    # `_load_state`/`_save_state` only touch the network when this looks like
    # an in-cluster run; the value itself is never read once `_incluster` is
    # replaced above.
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "fake")
    try:
        yield server
    finally:
        server.close()


def test_save_state_creates_against_the_collection_endpoint(fake_api_server, tmp_path) -> None:
    # Regression: this used to POST to `.../configmaps/{name}`, a path the real
    # API server has no route for. It 404d silently -- `_save_state` never
    # looked at the response -- so the very first tick's budget state was
    # never actually persisted, and every later tick "created" again from a
    # blank state because the GET that would have found it also 404d.
    state = _state(jobs_started_this_window=3)
    g._save_state(state, "agents", "governor-state", tmp_path / "state.json", existing=None)

    posts = [(m, p) for m, p in fake_api_server.requests if m == "POST"]
    assert posts == [("POST", "/api/v1/namespaces/agents/configmaps")]

    loaded, _ = g._load_state("agents", "governor-state", tmp_path / "other.json", NOW)
    assert loaded.jobs_started_this_window == 3


def test_save_state_updates_the_named_resource_when_it_already_exists(fake_api_server, tmp_path) -> None:
    g._save_state(_state(jobs_started_this_window=1), "agents", "governor-state", tmp_path / "s.json", existing=None)
    existing = fake_api_server._configmap

    g._save_state(
        _state(jobs_started_this_window=5),
        "agents",
        "governor-state",
        tmp_path / "s.json",
        existing=existing,
    )

    puts = [(m, p) for m, p in fake_api_server.requests if m == "PUT"]
    assert puts == [("PUT", "/api/v1/namespaces/agents/configmaps/governor-state")]

    loaded, _ = g._load_state("agents", "governor-state", tmp_path / "other.json", NOW)
    assert loaded.jobs_started_this_window == 5


def _governor_tree(tmp_path: Path) -> tuple[Path, Path, Path]:
    """policy.json + a one-item queue dir + a state path, as main() reads them."""
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(
        json.dumps(
            {
                "enabled": True,
                "maxConcurrent": 1,
                "models": {"chore": "gpt-5-mini", "deep": "gpt-5"},
            }
        )
    )
    queue_dir = tmp_path / "queue"
    queue_dir.mkdir()
    (queue_dir / "item.json").write_text(
        json.dumps(
            {
                "id": "demo",
                "repo": "Duncan-Haywood/monorepo-projects",
                "prompt": "do the thing",
                "modelClass": "chore",
            }
        )
    )
    return policy_path, queue_dir, tmp_path / "state.json"


def _run_main(monkeypatch, tmp_path, capsys) -> dict:
    policy_path, queue_dir, state_path = _governor_tree(tmp_path)
    monkeypatch.setenv("GOVERNOR_POLICY", str(policy_path))
    monkeypatch.setenv("GOVERNOR_QUEUE", str(queue_dir))
    monkeypatch.setenv("GOVERNOR_STATE", str(state_path))
    monkeypatch.setenv("GOVERNOR_NAMESPACE", "agents")
    monkeypatch.setenv("GOVERNOR_STATE_CONFIGMAP", "governor-state")
    rc = g.main([])
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.strip()]
    return {"rc": rc, "decision": json.loads(lines[0]), "lines": lines}


def test_unreadable_state_configmap_holds_instead_of_starting(
    fake_api_server, monkeypatch, tmp_path, capsys
) -> None:
    # The fake server has no ConfigMap yet, so _load_state's GET 404s exactly
    # the way the real API server does when governor-state is absent (namespace
    # rebuilt, Argo app re-added, sync not landed) or when RBAC drifts and the
    # GET 403s.
    #
    # _load_state then falls back to `state_path` -- the pod's own filesystem,
    # empty on every fresh pod -- so the budget it hands back reads "0 seconds
    # used, 0 jobs started this window". Without the guard in main() that is a
    # green light on every single tick: the 5-hour and weekly caps stop capping
    # and the governor authorizes another job forever, which is the exact
    # runaway it exists to prevent. `create` came off the Role in #2276, so the
    # ConfigMap can no longer heal itself into existence either.
    assert fake_api_server._configmap is None

    result = _run_main(monkeypatch, tmp_path, capsys)

    assert result["decision"]["action"] == "hold"
    assert "budget state unavailable" in result["decision"]["reason"]
    assert "governor-state" in result["decision"]["reason"]
    # The point of the guard: no Job was POSTed despite an enabled policy, a
    # non-empty queue and a budget that *looked* completely unspent.
    job_posts = [p for m, p in fake_api_server.requests if m == "POST" and "/jobs" in p]
    assert job_posts == []


def test_readable_state_configmap_still_starts(
    fake_api_server, monkeypatch, tmp_path, capsys
) -> None:
    # Control for the test above: the guard must key off "could not read the
    # counters", not off "the counters are zero". A genuinely fresh but
    # readable budget is still allowed to start work, otherwise the governor
    # would never start anything at all.
    g._save_state(_state(), "agents", "governor-state", tmp_path / "seed.json", existing=None)
    assert fake_api_server._configmap is not None

    result = _run_main(monkeypatch, tmp_path, capsys)

    assert result["decision"]["action"] == "start"
    job_posts = [p for m, p in fake_api_server.requests if m == "POST" and "/jobs" in p]
    assert job_posts == ["/apis/batch/v1/namespaces/agents/jobs"]


def test_a_dropped_state_write_fails_the_tick(fake_api_server, tmp_path) -> None:
    # A lost write is not cosmetic: the next tick reloads whatever is still in
    # the ConfigMap, so the seconds just spent are never charged to the window.
    # _save_state used to print to stderr and return None regardless, which
    # main() could not distinguish from success -- the CronJob went green while
    # the budget silently drifted behind reality.
    ok = g._save_state(_state(), "agents", "governor-state", tmp_path / "s.json", existing=None)
    assert ok is True

    # existing= a stale resourceVersion with no ConfigMap behind it forces the
    # PUT branch against a server that 404s it.
    fake_api_server._configmap = None
    stale = {"metadata": {"resourceVersion": "1"}}
    assert g._save_state(_state(), "agents", "governor-state", tmp_path / "s.json", stale) is False


# --- Queue rotation -------------------------------------------------------
#
# `pick_item` used to be `sorted(key=(-priority, id))[0]`: the single
# highest-priority enabled item, every tick, forever. With the four real
# queue items that meant `branch-pr-drain` took 100% of the Codex quota and
# `deploy-cicd-readiness`, `seo-discoverability-audit` and
# `product-feature-improvement` were unreachable -- not deprioritised,
# unreachable, until someone hand-edited priorities in git.
#
# That was defensible while the PR/branch backlog was the bottleneck. It
# stopped being defensible on 2026-08-30, when the repo had zero open PRs and
# every one of ~180 unmerged branches was superseded: the top item had nothing
# left to do and would still have consumed the whole budget re-triaging an
# empty queue.


def _four_real_priorities() -> list[g.QueueItem]:
    return [
        _item(id="branch-pr-drain", priority=5),
        _item(id="deploy-cicd-readiness", priority=4),
        _item(id="seo-discoverability-audit", priority=3),
        _item(id="product-feature-improvement", priority=2),
    ]


def test_highest_priority_item_still_opens_the_window() -> None:
    # Rotation must not cost the "drain existing work first" ordering: with a
    # clean slate the top item is still the one that runs.
    assert g.pick_item(_four_real_priorities(), {}).id == "branch-pr-drain"


def test_every_enabled_item_runs_instead_of_only_the_top_one() -> None:
    queue = _four_real_priorities()
    state = _state()
    for _ in range(20):
        item = g.pick_item(queue, state.runs_by_item)
        g.record_job_started(state, item.id)

    assert set(state.runs_by_item) == {i.id for i in queue}, state.runs_by_item
    # Higher priority still runs more often -- the point is proportion, not
    # equality. Against the old selector this list was [20, 0, 0, 0].
    counts = [state.runs_by_item[i.id] for i in queue]
    assert counts == sorted(counts, reverse=True), counts
    assert counts[0] > counts[-1]


def test_a_priority_zero_item_is_not_weightless() -> None:
    # Score is (priority + 1) / (runs + 1). Without the +1 a priority-0 item
    # scores 0 on every tick and can never win, which is the same starvation
    # bug in a different place.
    queue = [_item(id="top", priority=5), _item(id="zero", priority=0)]
    state = _state()
    for _ in range(12):
        g.record_job_started(state, g.pick_item(queue, state.runs_by_item).id)
    assert state.runs_by_item.get("zero", 0) > 0, state.runs_by_item


def test_pick_item_is_deterministic_on_a_tie() -> None:
    # Equal priority and equal runs must resolve by id, not by queue order,
    # so two governor replicas reading the same state agree.
    queue = [_item(id="b-task", priority=3), _item(id="a-task", priority=3)]
    assert g.pick_item(queue, {}).id == "a-task"
    assert g.pick_item(list(reversed(queue)), {}).id == "a-task"


def test_pick_item_without_state_keeps_the_old_highest_priority_behaviour() -> None:
    # The runs argument is optional so a caller that has no state (and the
    # first tick after a rollover) still gets plain priority order.
    assert g.pick_item(_four_real_priorities()).id == "branch-pr-drain"


def test_rollover_restarts_the_rotation() -> None:
    state = _state(window_started_at=NOW - 20_000, runs_by_item={"branch-pr-drain": 4})
    rolled = g.rollover(state, NOW, _policy(window_seconds=18_000))
    assert rolled.runs_by_item == {}
    # ...and an unfinished window leaves the counts alone.
    fresh = _state(window_started_at=NOW - 60, runs_by_item={"branch-pr-drain": 4})
    assert g.rollover(fresh, NOW, _policy()).runs_by_item == {"branch-pr-drain": 4}


def test_rollover_keeps_the_dedup_ledger_so_a_job_is_not_recharged() -> None:
    # `rollover` used to rebuild BudgetState without `accounted_job_uids`,
    # silently resetting the dedup ledger `absorb_finished_jobs` reads. A Job
    # still listed in the namespace at the moment a window rolled over was
    # therefore absorbed a second time and its duration charged against the
    # fresh window -- making the governor believe it had spent budget it had
    # not, and hold early. That under-spends the very quota this stack exists
    # to use.
    job = g.JobView(uid="job-1", succeeded=True, duration_seconds=600)
    policy = _policy(window_seconds=18_000)
    state = _state(window_started_at=NOW - 20_000)

    _, state = g.tick(policy, state, [job], [_item()], NOW)
    assert state.estimated_seconds_used == 0.0  # absorbed, then the window rolled

    # The same finished Job is still listed on the next tick.
    _, state = g.tick(policy, state, [job], [_item()], NOW + 60)
    assert state.estimated_seconds_used == 0.0, state.accounted_job_uids


def test_state_roundtrip_carries_the_run_counts() -> None:
    original = _state(runs_by_item={"branch-pr-drain": 2, "seo-discoverability-audit": 1})
    restored = g.state_from_dict(g.state_to_dict(original), NOW)
    assert restored.runs_by_item == {"branch-pr-drain": 2, "seo-discoverability-audit": 1}
    # Values come back from JSON as ints even if the ConfigMap held strings.
    coerced = g.state_from_dict({"runs_by_item": {"x": "3"}}, NOW)
    assert coerced.runs_by_item == {"x": 3}


def test_tick_records_the_run_against_the_item_it_started() -> None:
    queue = _four_real_priorities()
    decision, state = g.tick(_policy(), _state(), [], queue, NOW)
    assert decision.action == "start"
    assert state.runs_by_item == {decision.item.id: 1}


# --- Empty-item damping ---------------------------------------------------
#
# Rotation fixed starvation but not waste: weighting by priority alone assumes
# every item always has work. On 2026-08-31 two of the five provably did not --
# the repo had zero open PRs and every branch was merged, so
# `open-pr-repair-merge` (priority 6) and `branch-pr-drain` (5) were 13/25ths
# of the weight and none of the output. On a ChatGPT plan credential that is
# over half the included quota spent booting Codex to confirm there is nothing
# to do.
#
# A run that changes nothing now says so, and the score is damped by how many
# such runs an item has had in a row.


def _finished_job(uid: str, item: str, *, noop: bool, duration: float = 60.0) -> g.JobView:
    return g.JobView(
        uid=uid,
        active=0,
        succeeded=True,
        failed=False,
        duration_seconds=duration,
        item=item,
        noop=noop,
    )


def test_a_noop_run_is_read_off_the_termination_message() -> None:
    job = {
        "metadata": {"uid": "u1", "name": "codex-x-1", "labels": {"governor.item": "x"}},
        "status": {"succeeded": 1, "startTime": "2026-08-31T00:00:00Z",
                   "completionTime": "2026-08-31T00:01:00Z"},
    }
    pods = [{
        "metadata": {"labels": {"job-name": "codex-x-1"}},
        "status": {"containerStatuses": [
            {"state": {"terminated": {"exitCode": 0,
                                      "message": "codex-noop: no changes; not opening a PR"}}}
        ]},
    }]
    view = g.job_view_from_k8s(job, pods)
    assert view.noop is True
    assert view.item == "x"
    # It succeeded. A clean run that found nothing is not a failure.
    assert view.succeeded is True and view.failed is False


def test_a_productive_run_is_not_a_noop() -> None:
    job = {
        "metadata": {"uid": "u2", "name": "codex-y-1", "labels": {"governor.item": "y"}},
        "status": {"succeeded": 1},
    }
    pods = [{
        "metadata": {"labels": {"job-name": "codex-y-1"}},
        "status": {"containerStatuses": [
            {"state": {"terminated": {"exitCode": 0, "message": "opened PR #123"}}}
        ]},
    }]
    assert g.job_view_from_k8s(job, pods).noop is False


def test_a_quota_limit_is_never_counted_as_an_empty_item() -> None:
    # A run cut off by the fleet's own budget says nothing about whether the
    # item has work. Damping it would punish the item for the limit, and the
    # cooldown already covers that case.
    job = {
        "metadata": {"uid": "u3", "name": "codex-z-1", "labels": {"governor.item": "z"}},
        "status": {"failed": 1},
    }
    pods = [{
        "metadata": {"labels": {"job-name": "codex-z-1"}},
        "status": {"containerStatuses": [
            {"state": {"terminated": {"exitCode": g.EXIT_LIMIT, "message": "codex-noop: x"}}}
        ]},
    }]
    view = g.job_view_from_k8s(job, pods)
    assert view.limit_hit is True
    assert view.noop is False


def test_an_item_that_keeps_finding_nothing_yields_the_quota() -> None:
    # The real shape: the two top items are empty, the three below have work.
    queue = [
        _item(id="open-pr-repair-merge", priority=6),
        _item(id="branch-pr-drain", priority=5),
        _item(id="deploy-cicd-readiness", priority=4),
        _item(id="seo-discoverability-audit", priority=3),
        _item(id="product-feature-improvement", priority=2),
    ]
    empty = {"open-pr-repair-merge", "branch-pr-drain"}
    state = _state()
    policy = _policy(enabled=True)
    picked: list[str] = []

    for n in range(40):
        item = g.pick_item(queue, state.runs_by_item, state.noops_by_item)
        picked.append(item.id)
        g.record_job_started(state, item.id)
        state = g.absorb_finished_jobs(
            state,
            [_finished_job(f"u{n}", g._dns1123(item.id), noop=item.id in empty)],
            NOW,
        )
        state = g.rollover(state, NOW, policy)

    wasted = sum(1 for p in picked if p in empty)
    # Undamped these two carry 13/25 of the weight. Damped, they must fall well
    # under a third of the picks -- the quota goes to items that deliver.
    assert wasted < len(picked) / 3, picked
    # And the productive items actually get the ticks.
    assert picked.count("deploy-cicd-readiness") > 0
    assert picked.count("product-feature-improvement") > 0


def test_the_first_productive_run_clears_the_damping() -> None:
    state = _state(noops_by_item={"branch-pr-drain": 7})
    state = g.absorb_finished_jobs(
        state, [_finished_job("u9", "branch-pr-drain", noop=False)], NOW
    )
    assert "branch-pr-drain" not in state.noops_by_item


def test_damping_is_capped_so_an_empty_item_can_still_find_new_work() -> None:
    state = _state()
    for n in range(50):
        state = g.absorb_finished_jobs(
            state, [_finished_job(f"u{n}", "branch-pr-drain", noop=True)], NOW
        )
    assert state.noops_by_item["branch-pr-drain"] == g.MAX_NOOP_DAMPING
    # Capped damping still leaves it reachable: against a queue where every
    # other item has run a lot this window, the damped item wins again.
    queue = [_item(id="branch-pr-drain", priority=5), _item(id="other", priority=2)]
    assert g.pick_item(queue, {"other": 40}, state.noops_by_item).id == "branch-pr-drain"


def test_damping_survives_the_window_rollover() -> None:
    # runs_by_item restarts each window on purpose. An item being empty is a
    # fact about the repository, not the window -- if this reset, the fleet
    # would re-buy the same discovery with a Codex Job every five hours.
    state = _state(window_started_at=NOW - 20_000, noops_by_item={"branch-pr-drain": 4})
    rolled = g.rollover(state, NOW, _policy())
    assert rolled.runs_by_item == {}
    assert rolled.noops_by_item == {"branch-pr-drain": 4}


def test_damping_is_dropped_for_an_item_removed_from_the_queue() -> None:
    # noops_by_item is never emptied by rollover, so a deleted or renamed item
    # would otherwise leave its counter behind for good.
    state = _state(noops_by_item={"branch-pr-drain": 3, "deleted-item": 9})
    pruned = g.prune_noops(state, [_item(id="branch-pr-drain", priority=5)])
    assert pruned.noops_by_item == {"branch-pr-drain": 3}


def test_noop_counters_round_trip_through_the_state_configmap() -> None:
    state = _state(noops_by_item={"branch-pr-drain": 2})
    restored = g.state_from_dict(g.state_to_dict(state), NOW)
    assert restored.noops_by_item == {"branch-pr-drain": 2}


def test_a_crashed_run_neither_damps_nor_clears() -> None:
    # An OOM kill or a rejected credential says nothing about the queue.
    state = _state(noops_by_item={"branch-pr-drain": 3})
    crashed = g.JobView(uid="u1", active=0, succeeded=False, failed=True,
                        duration_seconds=5.0, item="branch-pr-drain", noop=False)
    state = g.absorb_finished_jobs(state, [crashed], NOW)
    assert state.noops_by_item == {"branch-pr-drain": 3}
