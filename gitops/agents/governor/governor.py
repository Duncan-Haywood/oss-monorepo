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
  reserveForInteractive    unused here except as documentation of the slack
  weeklyBudgetFraction     stop early in the week so you do not go dark
  cooldownOnLimitSeconds   sleep after a 429 instead of retrying immediately
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


@dataclass(frozen=True)
class Policy:
    enabled: bool = False
    max_concurrent: int = 1
    target_utilization: float = 0.90
    reserve_for_interactive: float = 0.10
    weekly_budget_fraction: float = 0.85
    window_seconds: int = WINDOW_SECONDS_DEFAULT
    cooldown_on_limit_seconds: int = 60 * 60
    models: dict[str, str] = field(
        default_factory=lambda: {"chore": "gpt-5-mini", "deep": "gpt-5"}
    )

    def effective_window_budget(self) -> float:
        # reserveForInteractive is the slack inside the window.
        usable = min(self.target_utilization, 1.0 - self.reserve_for_interactive)
        return max(0.0, usable) * self.window_seconds


@dataclass
class BudgetState:
    window_started_at: float
    estimated_seconds_used: float
    week_started_at: float
    week_seconds_used: float
    last_limit_at: float | None = None
    jobs_started_this_window: int = 0
    accounted_job_uids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class JobView:
    uid: str
    active: int = 0
    succeeded: bool = False
    failed: bool = False
    duration_seconds: float | None = None
    limit_hit: bool = False


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
    return QueueItem(
        id=item_id,
        repo=repo,
        prompt=prompt,
        model_class=model_class,
        priority=int(raw.get("priority") or 0),
        enabled=bool(raw.get("enabled", True)),
        ref=str(raw.get("ref") or "main"),
        workdir=str(raw.get("workdir") or ""),
    )


def load_queue(items: Iterable[dict[str, Any]]) -> list[QueueItem]:
    out: list[QueueItem] = []
    for raw in items:
        try:
            out.append(queue_item_from_dict(raw))
        except ValueError:
            continue
    return out


def pick_item(queue: Iterable[QueueItem]) -> QueueItem | None:
    enabled = [item for item in queue if item.enabled]
    if not enabled:
        return None
    return sorted(enabled, key=lambda item: (-item.priority, item.id))[0]


def rollover(state: BudgetState, now: float, policy: Policy) -> BudgetState:
    window_started = state.window_started_at
    week_started = state.week_started_at
    used = state.estimated_seconds_used
    week_used = state.week_seconds_used
    started = state.jobs_started_this_window
    if now - window_started >= policy.window_seconds:
        window_started = now
        used = 0.0
        started = 0
    if now - week_started >= WEEK_SECONDS:
        week_started = now
        week_used = 0.0
    return BudgetState(
        window_started_at=window_started,
        estimated_seconds_used=used,
        week_started_at=week_started,
        week_seconds_used=week_used,
        last_limit_at=state.last_limit_at,
        jobs_started_this_window=started,
    )


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

    if running_count >= policy.max_concurrent:
        return Decision("hold", f"already running {running_count} (max {policy.max_concurrent})")

    if state.estimated_seconds_used >= policy.effective_window_budget():
        return Decision("hold", "window utilization at target")

    week_budget = policy.weekly_budget_fraction * WEEK_SECONDS * policy.target_utilization
    if state.week_seconds_used >= week_budget:
        return Decision("hold", "weekly budget fraction exhausted")

    item = pick_item(queue)
    if item is None:
        return Decision("hold", "queue empty")

    model = policy.models[item.model_class]
    return Decision("start", f"start {item.id}", item=item, model=model)


def record_limit(state: BudgetState, now: float) -> BudgetState:
    state.last_limit_at = now
    return state


def record_job_finished(state: BudgetState, duration_seconds: float) -> BudgetState:
    used = max(0.0, duration_seconds)
    state.estimated_seconds_used += used
    state.week_seconds_used += used
    return state


def record_job_started(state: BudgetState) -> BudgetState:
    state.jobs_started_this_window += 1
    return state


def state_to_dict(state: BudgetState) -> dict[str, Any]:
    return asdict(state)


def state_from_dict(raw: dict[str, Any] | None, now: float) -> BudgetState:
    data = raw or {}
    last = data.get("last_limit_at")
    return BudgetState(
        window_started_at=float(data.get("window_started_at") or now),
        estimated_seconds_used=float(data.get("estimated_seconds_used") or 0),
        week_started_at=float(data.get("week_started_at") or now),
        week_seconds_used=float(data.get("week_seconds_used") or 0),
        last_limit_at=None if last is None else float(last),
        jobs_started_this_window=int(data.get("jobs_started_this_window") or 0),
        accounted_job_uids=[str(u) for u in (data.get("accounted_job_uids") or [])],
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
    limit_hit = False
    for pod in pods:
        labels = (pod.get("metadata") or {}).get("labels") or {}
        if labels.get("job-name") != job_name:
            continue
        for container in (pod.get("status") or {}).get("containerStatuses") or []:
            terminated = ((container.get("state") or {}).get("terminated")) or {}
            if int(terminated.get("exitCode") or 0) == EXIT_LIMIT:
                limit_hit = True
            if parse_limit_error(str(terminated.get("message") or "")):
                limit_hit = True
    return JobView(
        uid=uid,
        active=active,
        succeeded=succeeded,
        failed=failed,
        duration_seconds=duration,
        limit_hit=limit_hit,
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
    state = absorb_finished_jobs(state, jobs, now)
    state = rollover(state, now, policy)
    decision = decide(policy, state, count_running(jobs), queue, now)
    if decision.action == "start":
        record_job_started(state)
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
                    "containers": [
                        {
                            "name": "codex",
                            "image": "node:22-bookworm",
                            "command": ["bash", "/opt/worker/worker.sh"],
                            "env": [
                                {"name": "QUEUE_ITEM_JSON", "value": json.dumps(item.__dict__)},
                                {"name": "AGENT_MODEL", "value": model},
                                {"name": "CODEX_LIMIT_EXIT", "value": str(EXIT_LIMIT)},
                            ],
                            "envFrom": [{"secretRef": {"name": "codex-secrets", "optional": True}}],
                            "volumeMounts": [
                                {"name": "worker", "mountPath": "/opt/worker", "readOnly": True}
                            ],
                            "resources": {
                                "requests": {"cpu": "500m", "memory": "1Gi"},
                                "limits": {"cpu": "1500m", "memory": "3Gi"},
                            },
                        }
                    ],
                    "volumes": [
                        {"name": "worker", "configMap": {"name": "codex-worker-script", "defaultMode": 0o555}}
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
) -> None:
    blob = json.dumps(state_to_dict(state), separators=(",", ":"))
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(blob)
    if not (os.environ.get("KUBERNETES_SERVICE_HOST") and cm_name):
        return
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
        _k8s("PUT", f"/api/v1/namespaces/{namespace}/configmaps/{cm_name}", body)
        return
    _k8s("POST", f"/api/v1/namespaces/{namespace}/configmaps/{cm_name}", body)


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

    _save_state(state, namespace, state_cm, state_path, existing_cm)
    return 0 if created_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
