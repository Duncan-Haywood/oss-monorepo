"""The self-hosted Actions runner stack, and the workflow switch that uses it.

Context for anyone reading this later: GitHub-hosted Actions minutes are
metered on this private, user-owned repository, and from 2026-08-26 every
workflow run came back red within 3-6 seconds carrying `runner_id: 0`,
`runner_name: ""` and zero steps -- a job that was never assigned a runner,
not a job that ran and failed. These tests pin the two halves of the fix: a
runner that runs on our own hardware, and a single switch that moves all 217
workflows onto it.
"""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
CI = ROOT / "ci"
WORKFLOWS = REPO / ".github" / "workflows"

RUNS_ON = "${{ vars.CI_RUNNER || 'ubuntu-latest' }}"


def _ci_docs() -> dict[str, dict]:
    docs: dict[str, dict] = {}
    for path in CI.glob("*.yaml"):
        for doc in yaml.safe_load_all(path.read_text()):
            if doc:
                docs[doc["kind"]] = doc
    return docs


def test_every_workflow_reads_the_runner_switch() -> None:
    # The point of routing all 242 `runs-on` lines through one repo variable
    # is that moving between GitHub-hosted and self-hosted is a settings
    # change, not another 217-file commit. A workflow that hard-codes a runner
    # silently opts out of that and would keep burning metered minutes -- or
    # keep failing -- after the switch is flipped.
    workflows = sorted(WORKFLOWS.glob("*.yml"))
    assert len(workflows) > 200, "expected the full workflow set"
    for path in workflows:
        spec = yaml.safe_load(path.read_text())
        for name, job in (spec.get("jobs") or {}).items():
            assert job.get("runs-on") == RUNS_ON, f"{path.name}:{name}"


def test_the_switch_defaults_to_github_hosted() -> None:
    # With the variable unset the expression must fall back to ubuntu-latest,
    # so merging this changes nothing until an owner opts in. `vars.CI_RUNNER`
    # is the empty string when unset, which is falsy, so `||` yields the
    # default.
    assert "vars.CI_RUNNER" in RUNS_ON
    assert RUNS_ON.endswith("|| 'ubuntu-latest' }}")


def test_runner_is_ephemeral() -> None:
    # A reused runner carries the previous job's checkout and environment into
    # the next one. --ephemeral is what makes each job start clean.
    script = (CI / "runner-entrypoint.sh").read_text()
    assert "--ephemeral" in script
    assert "--unattended" in script


def test_runner_never_logs_the_api_response() -> None:
    # A failed registration call can echo the request back, and that request
    # carries the PAT. The error path must not print the response body.
    # Comments are allowed to mention the variable -- one does, explaining why
    # it is not printed. Only executable lines are checked.
    code = [
        line
        for line in (CI / "runner-entrypoint.sh").read_text().splitlines()
        if not line.lstrip().startswith("#")
    ]
    for line in code:
        if line.lstrip().startswith(("echo", "printf")):
            assert "${response}" not in line, line


def test_runner_holds_no_token_in_git() -> None:
    # The PAT arrives from a sealed Secret at runtime; the manifest names the
    # key and nothing else.
    deployment = _ci_docs()["Deployment"]
    container = deployment["spec"]["template"]["spec"]["containers"][0]
    env = {e["name"]: e for e in container["env"]}
    assert "value" not in env["RUNNER_TOKEN"]
    assert env["RUNNER_TOKEN"]["valueFrom"]["secretKeyRef"]["name"] == "actions-runner-secrets"


def test_runner_cannot_reach_the_cluster() -> None:
    # CI runs whatever a workflow says to run, on the same node as
    # marisstella.dev. It gets the internet and DNS; it does not get prod's
    # pods, the agents namespace, the API server, or cloud metadata.
    policy = _ci_docs()["NetworkPolicy"]["spec"]
    assert policy["ingress"] == []
    internet = policy["egress"][0]["to"][0]["ipBlock"]
    assert internet["cidr"] == "0.0.0.0/0"
    for blocked in ("10.42.0.0/16", "10.43.0.0/16", "169.254.0.0/16"):
        assert blocked in internet["except"], blocked

    deployment = _ci_docs()["Deployment"]
    pod = deployment["spec"]["template"]["spec"]
    assert pod["automountServiceAccountToken"] is False


def test_runner_yields_to_prod_and_stays_off_the_codex_node() -> None:
    pod = _ci_docs()["Deployment"]["spec"]["template"]["spec"]
    assert pod["priorityClassName"] == "ci-low"
    # The cpx22 is tainted for Codex Jobs and has 4 GB; CI belongs on the
    # control-plane node.
    assert pod["nodeSelector"] == {"hcloud/node-role": "control-plane"}

    classes = {
        d["metadata"]["name"]: d["value"]
        for d in yaml.safe_load_all((ROOT / "platform" / "priority-classes.yaml").read_text())
        if d
    }
    assert classes["ci-low"] < classes["agents-low"] < classes["prod-high"]


def test_runner_fits_the_ci_quota() -> None:
    quota = [
        d
        for d in yaml.safe_load_all((CI / "quota.yaml").read_text())
        if d and d["kind"] == "ResourceQuota"
    ][0]["spec"]["hard"]
    deployment = _ci_docs()["Deployment"]
    replicas = deployment["spec"]["replicas"]
    limits = deployment["spec"]["template"]["spec"]["containers"][0]["resources"]["limits"]
    assert replicas * _millicores(limits["cpu"]) <= _millicores(quota["limits.cpu"])
    assert replicas * _gib(limits["memory"]) <= _gib(quota["limits.memory"])
    assert replicas < int(quota["pods"])


def test_ci_project_cannot_dest_prod_or_agents() -> None:
    projects = [
        d
        for d in yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text())
        if d and d["metadata"]["name"] == "ci"
    ]
    assert len(projects) == 1
    namespaces = {d["namespace"] for d in projects[0]["spec"]["destinations"]}
    assert namespaces == {"ci"}
    assert projects[0]["spec"]["clusterResourceWhitelist"] == []


def test_ci_app_is_wired_into_argo() -> None:
    app = yaml.safe_load((ROOT / "apps" / "ci.yaml").read_text())
    assert app["spec"]["project"] == "ci"
    assert app["spec"]["source"]["path"] == "gitops/ci"
    kustomization = yaml.safe_load((ROOT / "apps" / "kustomization.yaml").read_text())
    assert "ci.yaml" in kustomization["resources"]


def _millicores(value: str) -> int:
    return int(value[:-1]) if value.endswith("m") else int(float(value) * 1000)


def _gib(value: str) -> float:
    if value.endswith("Gi"):
        return float(value[:-2])
    if value.endswith("Mi"):
        return float(value[:-2]) / 1024
    raise AssertionError(f"unhandled memory unit: {value}")
