#!/usr/bin/env python3
"""Counts the deployments pointing at images this repository cannot release.

`platform/k8s/apps/*/` holds a Deployment, Service, Ingress and PDB per venture,
each naming an image in the organisation registry. Writing those manifests is
the visible half of shipping and it is the half that gets written: on
2026-08-04, six of the eight organisation images they name had no producer
anywhere in the repository — no Dockerfile, no build job, nothing that could
put that tag in the registry. The manifests were complete, ArgoCD was pointed at
them, and the image would never exist.

`local-site-studio` is what that costs. It holds the most finished commerce code
in the monorepo — Stripe Checkout, billing portal, lead CRM, contact
persistence — and a Deployment that had been waiting on
`git.marisstella.dev/giteaadmin/local-site-studio:latest` since it was written.
Nothing could build it, so the venture closest to a first dollar could not be
deployed at all, and no gate said so.

Two numbers are measured here, both against `platform/image-release-baseline.yaml`
and both two-directional, like the coverage baselines, the release-lag budget and
the kill-criteria ratchet:

  * `without_build_path` — organisation images no workflow in this repository
    builds. Above the ceiling fails: a manifest was added for an image nothing
    produces, or a build job was deleted out from under one. More than `slack`
    below fails: a venture became buildable and the ceiling is now stale.

  * `mutable_reference` — apps whose image resolves to `:latest`, `:main`,
    `:master`, or no tag at all, after kustomize `images:` overrides are applied.
    `.gitea/workflows/deploy-services.yml` already forbids exactly these tags and
    already triggers on `platform/k8s/apps/**` — but it only inspects a Helm
    render of a chart with hardcoded example values, so it has never read one of
    these files. Seven apps carry the tag its own rule rejects.

Both ceilings are capped in this file at the number measured before this control
existed. A ceiling that can be raised to cover every app is not a ceiling, so
the only direction either number travels is down, and the only edits that move
them are giving an image a producer and pinning a release to a digest.

Nothing here deploys, promotes or edits a manifest. Which ventures should be in
the cluster, and on which digest, is the owner's decision. This only refuses to
let the count of undeliverable deployments grow quietly.

Usage:
    python3 scripts/ci/image_release_path.py           # audit, exit 1 on failure
    python3 scripts/ci/image_release_path.py --report  # measure, always exit 0
    python3 scripts/ci/image_release_path.py --json    # machine-readable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

APPS_DIR = "platform/k8s/apps"
WORKFLOWS_DIR = ".gitea/workflows"
BASELINE_PATH = "platform/image-release-baseline.yaml"

#: Images outside this prefix are third-party (service-template pins
#: `nginx:alpine` as a placeholder). This repository is not expected to build
#: them, and counting them would make the ceiling meaningless.
REGISTRY_PREFIX = "git.marisstella.dev/giteaadmin/"

#: The same set `.gitea/workflows/deploy-services.yml` rejects in its rendered
#: manifests. Kept identical on purpose: two different definitions of "mutable"
#: is the drift this file exists to catch.
MUTABLE_TAGS = frozenset({"latest", "main", "master"})

#: Evidence that a workflow builds container images at all. Both forms are in
#: use — pairwise-ci.yml shells out to `docker build`, homepage-ci.yml uses the
#: action.
BUILD_DIRECTIVE = re.compile(r"docker\s+build\b|docker/build-push-action")

REQUIRED_TOP_FIELDS = ("owner", "issue", "expires", "budget", "rationale")
REQUIRED_BUDGET_FIELDS = (
    "max_without_build_path",
    "max_mutable_references",
    "slack",
)

# Measured 2026-08-04, before this control existed: six of eight organisation
# images had no producer, and seven of eight resolved to a mutable tag. Those
# are the states these ceilings must never be argued back up to.
MAX_DECLARED_WITHOUT_BUILD_PATH = 6
MAX_DECLARED_MUTABLE_REFERENCES = 7

# Slack wide enough to swallow the whole cluster is not slack.
MAX_DECLARED_SLACK = 3

# The exception register's horizon, for the same reason.
MAX_EXPIRY_DAYS = 180


class RatchetError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class AppVerdict:
    app: str
    image: str
    repository: Optional[str]
    reference: str
    external: bool
    has_build_path: bool
    built_by: Optional[str]
    mutable: bool


def _containers(document: Any) -> List[Dict[str, Any]]:
    """Every container spec in a Deployment document, init containers included."""
    if not isinstance(document, dict):
        return []
    spec = (((document.get("spec") or {}).get("template") or {}).get("spec")) or {}
    found: List[Dict[str, Any]] = []
    for key in ("containers", "initContainers"):
        entries = spec.get(key) or []
        if isinstance(entries, list):
            found.extend(entry for entry in entries if isinstance(entry, dict))
    return found


def deployment_images(path: Path) -> List[str]:
    """Images named by the Deployment, in file order."""
    images: List[str] = []
    for document in yaml.safe_load_all(path.read_text(encoding="utf-8")):
        if not isinstance(document, dict) or document.get("kind") != "Deployment":
            continue
        for container in _containers(document):
            image = container.get("image")
            if isinstance(image, str) and image.strip():
                images.append(image.strip())
    return images


def kustomize_overrides(path: Path) -> Dict[str, Dict[str, str]]:
    """`images:` entries keyed by the name they override.

    Kustomize is what actually decides the reference ArgoCD applies, so reading
    the Deployment alone would report quick-pick-survey as mutable when its
    kustomization pins a digest.
    """
    if not path.exists():
        return {}
    document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    overrides: Dict[str, Dict[str, str]] = {}
    for entry in document.get("images") or []:
        if not isinstance(entry, dict) or "name" not in entry:
            continue
        overrides[str(entry["name"])] = {
            key: str(value)
            for key, value in entry.items()
            if key in ("newName", "newTag", "digest")
        }
    return overrides


def split_image(image: str) -> tuple[str, str]:
    """Split an image into (repository, reference).

    The reference is the digest, the tag, or `""` when the image carries
    neither. A registry host may contain a colon for a port, so only a colon
    after the final slash is a tag separator.
    """
    if "@" in image:
        repository, _, digest = image.partition("@")
        return repository, digest
    tail_start = image.rfind("/") + 1
    colon = image.find(":", tail_start)
    if colon == -1:
        return image, ""
    return image[:colon], image[colon + 1 :]


def resolve(image: str, overrides: Dict[str, Dict[str, str]]) -> tuple[str, str]:
    """Apply the kustomize override for an image, returning (repository, reference)."""
    repository, reference = split_image(image)
    override = overrides.get(repository) or overrides.get(image) or {}
    repository = override.get("newName", repository)
    if "digest" in override:
        return repository, override["digest"]
    if "newTag" in override:
        return repository, override["newTag"]
    return repository, reference


def is_mutable(reference: str) -> bool:
    """A reference nothing can pin a release to."""
    if not reference:
        return True
    if reference.startswith("sha256:"):
        return False
    return reference in MUTABLE_TAGS


def building_workflows(repo_root: Path) -> Dict[str, str]:
    """Organisation image repository -> the workflow that builds it.

    A workflow counts only when it actually contains a build directive. Naming
    an image while merely deploying it — which every GitOps job does — is not
    producing it, and treating it as such is how a control ends up unable to
    fail.
    """
    produced: Dict[str, str] = {}
    workflows = sorted((repo_root / WORKFLOWS_DIR).glob("*.yml"))
    for workflow in workflows:
        text = workflow.read_text(encoding="utf-8")
        if not BUILD_DIRECTIVE.search(text):
            continue
        for name in re.findall(
            re.escape(REGISTRY_PREFIX) + r"([A-Za-z0-9._-]+)", text
        ):
            produced.setdefault(name, workflow.name)
    return produced


def audit_apps(repo_root: Path) -> List[AppVerdict]:
    """One verdict per image named by an app under platform/k8s/apps."""
    produced = building_workflows(repo_root)
    verdicts: List[AppVerdict] = []
    apps_dir = repo_root / APPS_DIR
    for app_dir in sorted(p for p in apps_dir.iterdir() if p.is_dir()):
        deployment = app_dir / "deployment.yaml"
        if not deployment.exists():
            continue
        overrides = kustomize_overrides(app_dir / "kustomization.yaml")
        for image in deployment_images(deployment):
            repository, reference = resolve(image, overrides)
            external = not repository.startswith(REGISTRY_PREFIX)
            name = None if external else repository[len(REGISTRY_PREFIX) :]
            built_by = produced.get(name) if name else None
            verdicts.append(
                AppVerdict(
                    app=app_dir.name,
                    image=image,
                    repository=repository,
                    reference=reference,
                    external=external,
                    # A third-party image is not this repository's to build.
                    has_build_path=external or built_by is not None,
                    built_by=built_by,
                    mutable=False if external else is_mutable(reference),
                )
            )
    return verdicts


def load_baseline(repo_root: Path) -> Dict[str, Any]:
    """Read and validate the declaration, refusing anything a gate cannot trust."""
    path = repo_root / BASELINE_PATH
    if not path.exists():
        raise RatchetError(f"{BASELINE_PATH} is missing; the ceiling must be declared")

    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        # A declaration that cannot be parsed is not a passing declaration.
        raise RatchetError(f"{BASELINE_PATH} is not valid YAML: {error}") from error
    if not isinstance(document, dict):
        raise RatchetError(f"{BASELINE_PATH} must be a mapping")

    for field in REQUIRED_TOP_FIELDS:
        if not document.get(field):
            raise RatchetError(f"{BASELINE_PATH} is missing required field `{field}`")

    budget = document.get("budget")
    if not isinstance(budget, dict):
        raise RatchetError(f"{BASELINE_PATH} `budget` must be a mapping")
    for field in REQUIRED_BUDGET_FIELDS:
        value = budget.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise RatchetError(
                f"{BASELINE_PATH} `budget.{field}` must be a non-negative integer"
            )

    if budget["max_without_build_path"] > MAX_DECLARED_WITHOUT_BUILD_PATH:
        raise RatchetError(
            f"{BASELINE_PATH} declares max_without_build_path="
            f"{budget['max_without_build_path']}, above the cap of "
            f"{MAX_DECLARED_WITHOUT_BUILD_PATH}. That cap is the number measured "
            "before this control existed; raising it past that restores the state "
            "the control was written to end. Give an image a producer instead."
        )
    if budget["max_mutable_references"] > MAX_DECLARED_MUTABLE_REFERENCES:
        raise RatchetError(
            f"{BASELINE_PATH} declares max_mutable_references="
            f"{budget['max_mutable_references']}, above the cap of "
            f"{MAX_DECLARED_MUTABLE_REFERENCES}. Pin a release to a digest instead."
        )
    if budget["slack"] > MAX_DECLARED_SLACK:
        raise RatchetError(
            f"{BASELINE_PATH} declares slack={budget['slack']}, above the cap of "
            f"{MAX_DECLARED_SLACK}."
        )

    expires = document.get("expires")
    if isinstance(expires, datetime):
        expires = expires.date()
    if not isinstance(expires, date):
        raise RatchetError(f"{BASELINE_PATH} `expires` must be a date")
    horizon = (expires - date.today()).days
    if horizon < 0:
        raise RatchetError(
            f"{BASELINE_PATH} expired on {expires}; re-measure and re-declare it"
        )
    if horizon > MAX_EXPIRY_DAYS:
        raise RatchetError(
            f"{BASELINE_PATH} expires in {horizon} days, beyond the "
            f"{MAX_EXPIRY_DAYS}-day horizon"
        )

    return document


def measure(repo_root: Path) -> Dict[str, Any]:
    """The two counts plus the verdicts behind them."""
    verdicts = audit_apps(repo_root)
    without_build_path = [v for v in verdicts if not v.has_build_path]
    mutable = [v for v in verdicts if v.mutable]
    return {
        "apps": [asdict(v) for v in verdicts],
        "without_build_path": len(without_build_path),
        "mutable_references": len(mutable),
        "without_build_path_apps": sorted({v.app for v in without_build_path}),
        "mutable_reference_apps": sorted({v.app for v in mutable}),
    }


def evaluate(repo_root: Path) -> tuple[Dict[str, Any], List[str]]:
    """Measure, compare against the declaration, and return any failures."""
    measured = measure(repo_root)
    baseline = load_baseline(repo_root)
    budget = baseline["budget"]
    slack = budget["slack"]
    failures: List[str] = []

    checks = (
        ("without_build_path", "max_without_build_path", "without_build_path_apps",
         "images no workflow in this repository builds"),
        ("mutable_references", "max_mutable_references", "mutable_reference_apps",
         "apps resolving to a mutable reference"),
    )
    for measured_key, ceiling_key, apps_key, description in checks:
        actual = measured[measured_key]
        ceiling = budget[ceiling_key]
        if actual > ceiling:
            failures.append(
                f"{description}: measured {actual}, above the declared "
                f"{ceiling_key}={ceiling}. Offenders: "
                f"{', '.join(measured[apps_key]) or 'none'}."
            )
        elif ceiling - actual > slack:
            failures.append(
                f"{description}: measured {actual}, more than slack={slack} below "
                f"the declared {ceiling_key}={ceiling}. The ceiling is stale — "
                "lower it to lock the improvement in."
            )

    measured["baseline"] = budget
    return measured, failures


def _print_report(measured: Dict[str, Any]) -> None:
    print("Image release path")
    print(f"  images named by platform/k8s/apps: {len(measured['apps'])}")
    print(f"  without a build path:              {measured['without_build_path']}")
    for app in measured["without_build_path_apps"]:
        print(f"    - {app}")
    print(f"  mutable references:                {measured['mutable_references']}")
    for app in measured["mutable_reference_apps"]:
        print(f"    - {app}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--report", action="store_true", help="measure, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    if args.report:
        measured = measure(REPO_ROOT)
        print(json.dumps(measured, indent=2)) if args.json else _print_report(measured)
        return 0

    try:
        measured, failures = evaluate(REPO_ROOT)
    except RatchetError as error:
        # Fail closed: a declaration that cannot be read is not a pass.
        print(f"✗ Image release path: {error}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps({**measured, "failures": failures}, indent=2))
    else:
        _print_report(measured)

    if failures:
        for failure in failures:
            print(f"✗ Image release path: {failure}", file=sys.stderr)
        return 1

    print("✓ Image release path within the declared baseline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
