"""Shape and safety checks on the GitOps tree. No cluster required."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "agents"
REPO = ROOT.parent
SECRETISH = (
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "AGE-SECRET-KEY-1",
    "ghp_",
    "github_pat_",
)


def _yaml_files() -> list[Path]:
    skip = {ROOT / "tests"}
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if any(part.startswith(".") for part in path.parts):
            continue
        if any(s in path.parents or path.parent == s for s in skip):
            continue
        if path.suffix in {".yaml", ".yml"} and path.is_file():
            files.append(path)
    return files


def _docs() -> list[Path]:
    return list(REPO.glob("gitops/**/*.yaml")) + list(REPO.glob("infra/*.tf"))


def test_all_yaml_parses() -> None:
    for path in _yaml_files():
        docs = list(yaml.safe_load_all(path.read_text()))
        assert docs, path


def test_no_live_secrets_in_git() -> None:
    for path in list(ROOT.rglob("*")) + list((REPO / "infra").glob("*.tf")) + list(
        (REPO / "bootstrap").rglob("*")
    ):
        if not path.is_file():
            continue
        if path.suffix in {".png", ".jpg"}:
            continue
        if "tests" in path.parts:
            continue
        text = path.read_text(errors="ignore")
        for needle in SECRETISH:
            assert needle not in text, f"{path} looks like it contains {needle}"


def test_agents_project_cannot_dest_prod() -> None:
    docs = list(yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text()))
    by_name = {d["metadata"]["name"]: d for d in docs if d}
    agents = by_name["agents"]["spec"]["destinations"]
    assert [d["namespace"] for d in agents] == ["agents"]
    prod = by_name["prod"]["spec"]["destinations"]
    assert "agents" not in [d["namespace"] for d in prod]
    assert [d["namespace"] for d in prod] == ["prod"]


def test_governor_starts_disabled() -> None:
    cron = yaml.safe_load((AGENTS / "governor" / "cronjob.yaml").read_text())
    assert cron["spec"]["suspend"] is True
    policy = (AGENTS / "governor" / "policy.json").read_text()
    assert '"enabled": false' in policy
    assert '"maxConcurrent": 1' in policy


def test_worker_script_never_merges() -> None:
    text = (AGENTS / "workers" / "worker.sh").read_text()
    assert "gh pr merge" not in text
    assert "git push" in text
    assert "--base" in text


def test_job_template_from_governor_hides_sa_token() -> None:
    # The live Job is built in Python; the CronJob (governor) DOES mount a token.
    cron = yaml.safe_load((AGENTS / "governor" / "cronjob.yaml").read_text())
    assert cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["serviceAccountName"] == "governor"
    rbac = (AGENTS / "rbac.yaml").read_text()
    assert "automountServiceAccountToken: false" in rbac
    assert "codex-worker" in rbac


def test_root_tracks_main_of_this_repo() -> None:
    root = yaml.safe_load((ROOT / "root.yaml").read_text())
    assert root["spec"]["source"]["repoURL"].endswith("Duncan-Haywood/monorepo-projects.git")
    assert root["spec"]["source"]["targetRevision"] == "main"
    assert root["spec"]["source"]["path"] == "gitops/apps"


def test_prod_landing_has_no_marisstella_ingress() -> None:
    landing = Path(ROOT / "prod" / "landing.yaml").read_text()
    assert "kind: Ingress" not in landing
    assert "marisstella.dev" in landing  # mentioned as do-not-hijack


def test_infra_adopts_existing_servers() -> None:
    inventory = (REPO / "infra" / "inventory.tf").read_text()
    assert "163417666" in inventory
    assert "163580094" in inventory
    assert "cpx52" in inventory
    assert "cpx22" in inventory
