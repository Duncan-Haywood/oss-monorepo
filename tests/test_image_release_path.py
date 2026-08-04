"""Tests for the image release path ratchet.

A ratchet that cannot fail is worse than no ratchet, because CI prints a tick
for it. Most of what follows is therefore the failing direction: manifests that
name an unbuildable image, workflows that mention an image without building it,
declarations above their cap, and ceilings that have gone stale. The detector is
exercised against known-releasable and known-undeliverable fixtures for the same
reason `platform/ci/test/gate-substance.test.mjs` unit-tests its matcher — a
detector that silently matches nothing would pass forever while enforcing
nothing.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

from datetime import date, timedelta

import pytest

import image_release_path as irp


# --------------------------------------------------------------------------
# Reference parsing
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "image,expected",
    [
        ("git.marisstella.dev/giteaadmin/app:latest", ("git.marisstella.dev/giteaadmin/app", "latest")),
        ("git.marisstella.dev/giteaadmin/app", ("git.marisstella.dev/giteaadmin/app", "")),
        ("nginx:alpine", ("nginx", "alpine")),
        ("nginx", ("nginx", "")),
        (
            "registry:5000/team/app:v1",
            ("registry:5000/team/app", "v1"),
        ),
        # A registry port must not be mistaken for a tag.
        ("registry:5000/team/app", ("registry:5000/team/app", "")),
        (
            "git.marisstella.dev/giteaadmin/app@sha256:" + "a" * 64,
            ("git.marisstella.dev/giteaadmin/app", "sha256:" + "a" * 64),
        ),
    ],
)
def test_split_image(image, expected):
    assert irp.split_image(image) == expected


@pytest.mark.parametrize(
    "reference,mutable",
    [
        ("latest", True),
        ("main", True),
        ("master", True),
        ("", True),  # no tag at all resolves to :latest at pull time
        ("v1.2.3", False),
        ("sha256:" + "b" * 64, False),
    ],
)
def test_is_mutable(reference, mutable):
    assert irp.is_mutable(reference) is mutable


def test_kustomize_digest_overrides_a_mutable_deployment_tag():
    """quick-pick-survey's shape: mutable in the Deployment, pinned by kustomize."""
    overrides = {
        "git.marisstella.dev/giteaadmin/app": {"digest": "sha256:" + "c" * 64}
    }
    repository, reference = irp.resolve(
        "git.marisstella.dev/giteaadmin/app:latest", overrides
    )
    assert repository == "git.marisstella.dev/giteaadmin/app"
    assert irp.is_mutable(reference) is False


def test_kustomize_newtag_can_reintroduce_mutability():
    """The override is what ships, so a mutable newTag over a pinned tag counts."""
    overrides = {"git.marisstella.dev/giteaadmin/app": {"newTag": "latest"}}
    _, reference = irp.resolve("git.marisstella.dev/giteaadmin/app:v1", overrides)
    assert irp.is_mutable(reference) is True


# --------------------------------------------------------------------------
# Fixture repositories
# --------------------------------------------------------------------------


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def make_app(root: Path, name: str, image: str, kustomize_images: str = "") -> None:
    write(
        root / irp.APPS_DIR / name / "deployment.yaml",
        "apiVersion: apps/v1\n"
        "kind: Deployment\n"
        f"metadata:\n  name: {name}\n"
        "spec:\n  template:\n    spec:\n      containers:\n"
        f"      - name: {name}\n        image: {image}\n",
    )
    if kustomize_images:
        write(
            root / irp.APPS_DIR / name / "kustomization.yaml",
            "apiVersion: kustomize.config.k8s.io/v1beta1\n"
            "kind: Kustomization\n"
            f"images:\n{kustomize_images}",
        )


def make_baseline(
    root: Path,
    *,
    without_build_path: int,
    mutable: int,
    slack: int = 2,
    expires: date | None = None,
) -> None:
    expires = expires or (date.today() + timedelta(days=90))
    write(
        root / irp.BASELINE_PATH,
        "owner: duncan\n"
        "issue: docs/ENGINEERING-ROADMAP.md#image-release-path\n"
        f"expires: {expires.isoformat()}\n"
        "budget:\n"
        f"  max_without_build_path: {without_build_path}\n"
        f"  max_mutable_references: {mutable}\n"
        f"  slack: {slack}\n"
        "rationale: fixture\n",
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / irp.WORKFLOWS_DIR).mkdir(parents=True)
    (tmp_path / irp.APPS_DIR).mkdir(parents=True)
    return tmp_path


# --------------------------------------------------------------------------
# Build-path detection
# --------------------------------------------------------------------------


def test_image_with_a_docker_build_workflow_is_releasable(repo: Path):
    make_app(repo, "shipper", irp.REGISTRY_PREFIX + "shipper:v1")
    write(
        repo / irp.WORKFLOWS_DIR / "shipper.yml",
        "jobs:\n  container:\n    steps:\n"
        f"      - run: docker build --tag {irp.REGISTRY_PREFIX}shipper:$SHA .\n",
    )
    measured = irp.measure(repo)
    assert measured["without_build_path"] == 0
    assert measured["apps"][0]["built_by"] == "shipper.yml"


def test_build_push_action_also_counts(repo: Path):
    make_app(repo, "shipper", irp.REGISTRY_PREFIX + "shipper:v1")
    write(
        repo / irp.WORKFLOWS_DIR / "shipper.yml",
        "jobs:\n  container:\n    steps:\n"
        "      - uses: docker/build-push-action@abc\n"
        f"        with:\n          tags: {irp.REGISTRY_PREFIX}shipper:sha\n",
    )
    assert irp.measure(repo)["without_build_path"] == 0


def test_a_workflow_that_only_deploys_does_not_count_as_a_producer(repo: Path):
    """The defect this control exists for: manifests and deploy jobs, no build.

    Every GitOps job names the image it rolls out. Treating a mention as
    production is how this check would end up unable to fail.
    """
    make_app(repo, "phantom", irp.REGISTRY_PREFIX + "phantom:v1")
    write(
        repo / irp.WORKFLOWS_DIR / "deploy.yml",
        "jobs:\n  deploy:\n    steps:\n"
        f"      - run: kubectl set image deploy/phantom app={irp.REGISTRY_PREFIX}phantom:v1\n",
    )
    measured = irp.measure(repo)
    assert measured["without_build_path"] == 1
    assert measured["without_build_path_apps"] == ["phantom"]


def test_a_workflow_building_a_different_image_does_not_cover_this_one(repo: Path):
    make_app(repo, "phantom", irp.REGISTRY_PREFIX + "phantom:v1")
    write(
        repo / irp.WORKFLOWS_DIR / "other.yml",
        f"jobs:\n  c:\n    steps:\n      - run: docker build --tag {irp.REGISTRY_PREFIX}other:v1 .\n",
    )
    assert irp.measure(repo)["without_build_path"] == 1


def test_third_party_images_are_out_of_scope(repo: Path):
    """service-template pins nginx:alpine; this repository is not its producer."""
    make_app(repo, "service-template", "nginx:alpine")
    measured = irp.measure(repo)
    assert measured["without_build_path"] == 0
    assert measured["mutable_references"] == 0
    assert measured["apps"][0]["external"] is True


def test_init_containers_are_audited_too(repo: Path):
    write(
        repo / irp.APPS_DIR / "withinit" / "deployment.yaml",
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: withinit\n"
        "spec:\n  template:\n    spec:\n      initContainers:\n"
        f"      - name: migrate\n        image: {irp.REGISTRY_PREFIX}migrate:latest\n"
        "      containers:\n"
        f"      - name: app\n        image: {irp.REGISTRY_PREFIX}app:latest\n",
    )
    assert irp.measure(repo)["without_build_path"] == 2


def test_non_deployment_documents_are_ignored(repo: Path):
    write(
        repo / irp.APPS_DIR / "svc" / "deployment.yaml",
        "apiVersion: v1\nkind: Service\nmetadata:\n  name: svc\n",
    )
    assert irp.measure(repo)["apps"] == []


# --------------------------------------------------------------------------
# The ratchet itself
# --------------------------------------------------------------------------


def test_passes_when_measurement_matches_the_declaration(repo: Path):
    make_app(repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
    make_baseline(repo, without_build_path=1, mutable=1)
    _, failures = irp.evaluate(repo)
    assert failures == []


def test_fails_when_an_unbuildable_deployment_is_added(repo: Path):
    make_app(repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
    make_app(repo, "phantom2", irp.REGISTRY_PREFIX + "phantom2:latest")
    make_baseline(repo, without_build_path=1, mutable=2)
    _, failures = irp.evaluate(repo)
    assert any("max_without_build_path=1" in f for f in failures)
    assert any("phantom2" in f for f in failures)


def test_fails_when_a_ceiling_has_gone_stale(repo: Path):
    """The other direction: an improvement that nobody locked in."""
    make_app(repo, "shipper", irp.REGISTRY_PREFIX + "shipper:v1")
    write(
        repo / irp.WORKFLOWS_DIR / "shipper.yml",
        f"jobs:\n  c:\n    steps:\n      - run: docker build --tag {irp.REGISTRY_PREFIX}shipper:v1 .\n",
    )
    make_baseline(repo, without_build_path=5, mutable=0, slack=2)
    _, failures = irp.evaluate(repo)
    assert any("stale" in f for f in failures)


def test_fails_when_a_release_becomes_mutable(repo: Path):
    make_app(repo, "pinned", irp.REGISTRY_PREFIX + "pinned:latest")
    make_baseline(repo, without_build_path=1, mutable=0)
    _, failures = irp.evaluate(repo)
    assert any("mutable" in f for f in failures)


# --------------------------------------------------------------------------
# The declaration must be trustworthy
# --------------------------------------------------------------------------


def test_missing_baseline_fails_closed(repo: Path):
    with pytest.raises(irp.RatchetError, match="missing"):
        irp.load_baseline(repo)


@pytest.mark.parametrize("field", irp.REQUIRED_TOP_FIELDS)
def test_missing_required_field_fails_closed(repo: Path, field: str):
    import yaml

    make_baseline(repo, without_build_path=1, mutable=1)
    path = repo / irp.BASELINE_PATH
    document = yaml.safe_load(path.read_text())
    del document[field]
    path.write_text(yaml.safe_dump(document), encoding="utf-8")
    with pytest.raises(irp.RatchetError):
        irp.load_baseline(repo)


@pytest.mark.parametrize("field", irp.REQUIRED_BUDGET_FIELDS)
def test_missing_budget_field_fails_closed(repo: Path, field: str):
    import yaml

    make_baseline(repo, without_build_path=1, mutable=1)
    path = repo / irp.BASELINE_PATH
    document = yaml.safe_load(path.read_text())
    del document["budget"][field]
    path.write_text(yaml.safe_dump(document), encoding="utf-8")
    with pytest.raises(irp.RatchetError, match=field):
        irp.load_baseline(repo)


def test_unparseable_baseline_fails_closed(repo: Path):
    make_baseline(repo, without_build_path=1, mutable=1)
    path = repo / irp.BASELINE_PATH
    path.write_text("budget:\n  max: [unclosed\n", encoding="utf-8")
    with pytest.raises(irp.RatchetError, match="not valid YAML"):
        irp.load_baseline(repo)


def test_ceiling_above_its_cap_is_refused(repo: Path):
    make_baseline(
        repo,
        without_build_path=irp.MAX_DECLARED_WITHOUT_BUILD_PATH + 1,
        mutable=1,
    )
    with pytest.raises(irp.RatchetError, match="above the cap"):
        irp.load_baseline(repo)


def test_mutable_ceiling_above_its_cap_is_refused(repo: Path):
    make_baseline(
        repo,
        without_build_path=1,
        mutable=irp.MAX_DECLARED_MUTABLE_REFERENCES + 1,
    )
    with pytest.raises(irp.RatchetError, match="above the cap"):
        irp.load_baseline(repo)


def test_slack_above_its_cap_is_refused(repo: Path):
    make_baseline(
        repo, without_build_path=1, mutable=1, slack=irp.MAX_DECLARED_SLACK + 1
    )
    with pytest.raises(irp.RatchetError, match="slack"):
        irp.load_baseline(repo)


def test_expired_baseline_is_refused(repo: Path):
    make_baseline(
        repo,
        without_build_path=1,
        mutable=1,
        expires=date.today() - timedelta(days=1),
    )
    with pytest.raises(irp.RatchetError, match="expired"):
        irp.load_baseline(repo)


def test_expiry_beyond_the_horizon_is_refused(repo: Path):
    make_baseline(
        repo,
        without_build_path=1,
        mutable=1,
        expires=date.today() + timedelta(days=irp.MAX_EXPIRY_DAYS + 10),
    )
    with pytest.raises(irp.RatchetError, match="horizon"):
        irp.load_baseline(repo)


def test_non_integer_ceiling_is_refused(repo: Path):
    make_baseline(repo, without_build_path=1, mutable=1)
    path = repo / irp.BASELINE_PATH
    path.write_text(
        path.read_text().replace(
            "max_without_build_path: 1", "max_without_build_path: some"
        ),
        encoding="utf-8",
    )
    with pytest.raises(irp.RatchetError, match="non-negative integer"):
        irp.load_baseline(repo)


# --------------------------------------------------------------------------
# The real repository
# --------------------------------------------------------------------------


class TestRealRepository:
    def test_the_audit_runs_against_this_repository(self):
        measured = irp.measure(REPO_ROOT)
        assert measured["apps"], "no Kubernetes app manifests were found at all"

    def test_local_site_studio_can_now_be_built(self):
        """The worked example. If this regresses, the venture is undeliverable again."""
        measured = irp.measure(REPO_ROOT)
        assert "local-site-studio" not in measured["without_build_path_apps"]

    def test_this_repository_is_within_its_declared_baseline(self):
        _, failures = irp.evaluate(REPO_ROOT)
        assert failures == [], "; ".join(failures)
