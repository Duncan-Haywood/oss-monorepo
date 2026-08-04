#!/usr/bin/env python3
"""Every container image a manifest deploys is pinned to an immutable reference.

`.gitea/workflows/deploy-services.yml` already had a step called "Reject mutable
image tags". It rendered the Helm chart with `--set image.tag=ci-$GITHUB_SHA`
and then grepped that rendered output for `latest|main|master`. The tag it
searched for was one it had just set itself, to a value that can never match, so
the step passed unconditionally — a gate that is declared, reachable, executed,
and incapable of failing. Meanwhile the manifests that actually describe what
runs, `platform/k8s/apps/*/deployment.yaml`, were never read by it at all, and
carried eight mutable references between them.

A mutable tag means the cluster's running code cannot be named. `:latest`
resolves to whatever was pushed last, so a rollback has no target, an audit has
no answer, and a compromised or accidental push is deployed without a diff. An
image reference with no tag is the same failure spelled differently — Kubernetes
supplies `:latest` for it — which is why the omitted tag is checked here rather
than assumed benign.

Accepted violations live in `platform/image-tag-exceptions.yaml` with an owner,
a reason, an expiry and an exact count, matching the `count` contract in
`platform/exception-register.yaml`: the audit fails when the real number is
higher, because the gap grew and nobody decided that, and when it is lower,
because the register is stale.

`tests/test_image_tags.py` runs the same audit under pytest and proves the
detector rejects a mutable reference and accepts a pinned one — the property the
step this replaces never had.

Two widenings, 2026-08-04
-------------------------

**Both deployment surfaces, not one.** `SCAN_ROOT` was `platform/k8s` and
nothing else. `platform/terraform/` renders the same `helm/web-service` chart,
is applied against the same cluster, and was read by no control at all — which
is how `codercom/code-server` came to sit at `:latest` behind a public Traefik
ingress on `code.marisstella.dev` and again on `opencode.marisstella.dev`. A
code-server is a remote shell; `:latest` means nobody can say which one is
answering. `scripts/ci/terraform_images.py` reads that surface, refusing by
construction to open `*.tfvars` or `*.tfstate`.

**An allowlist of immutable forms, not a denylist of bad words.**
`MUTABLE_TAGS` was ten words, so `:release`, `:current`, `:staging`, `:live`,
`:rolling` and `:alpine` all read as "pinned" — and the docstring for that
constant claimed `alpine` was "caught by the digest rule instead", which it was
not. A denylist is the wrong shape: it is a list of the mutable tags somebody
happened to think of, and every tag nobody thought of passes. The rule is
stated the other way round here — *a tag must be immutable evidence* — so the
question is no longer "is this one of the bad words" but "does this name one
specific build". See `is_immutable_tag`.
"""

from __future__ import annotations

import argparse
import fnmatch
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import yaml

from terraform_images import TERRAFORM_ROOT, TerraformSurfaceError, scan_terraform

SCAN_ROOT = "platform/k8s"
EXCEPTIONS_PATH = "platform/image-tag-exceptions.yaml"

REQUIRED_FIELDS = ("id", "path", "owner", "issue", "reason", "expires", "count")

#: An exception nobody re-reads is a policy change made without review. Same cap
#: as `platform/exception-register.yaml`.
MAX_EXPIRY_DAYS = 180

#: A version-like tag: an optional `v`, then a number, then anything. `v1.36.0`,
#: `1.38.0`, `16-alpine`, `3.11-slim`, `0.38.0-alpine`, `2026.08.04` all name a
#: release. It is weaker than a digest — `16-alpine` still floats within its
#: minor line — and that is why the register points every venture at the digest
#: `platform/ci/promote-pairwise-gitops.sh` already writes. It is accepted as
#: evidence because it names a release the upstream project published, which
#: `:alpine` and `:plain-text` and `:stable` do not.
VERSION_TAG = re.compile(r"^v?\d+(?:\.\d+)*(?:[-_.+][A-Za-z0-9][A-Za-z0-9._+-]*)?$")

#: A build identity: a commit sha, optionally prefixed the way this repository's
#: own workflows prefix them. `.gitea/workflows/print-atelier-image.yml` and
#: `local-site-studio-image.yml` both publish `${{ github.sha }}` and both
#: deliberately decline to publish `:latest`, so this is the form the repository
#: already produces.
BUILD_TAG = re.compile(r"^(?:ci-|sha-|git-|build-)?[0-9a-f]{7,64}$")


#: A digest is `sha256:` followed by exactly 64 lowercase hex characters.
#: Anything else is not a digest that a registry can resolve, however much it
#: looks like one: `sha256:latest` and a digest truncated in review both used to
#: read here as evidence of a specific build.
DIGEST_FORM = re.compile(r"^sha256:[0-9a-f]{64}$")

#: The digest of the empty byte stream. No image manifest is empty, so this
#: value identifies nothing — it is what a digest-shaped string looks like when
#: the field needed filling and the image was never built. It reached
#: `platform/k8s/apps/local-site-studio/kustomization.yaml` on 2026-08-04 as
#: `digest: sha256:e3b0c442…`, which retired that overlay from IMG-001 and
#: lowered the exception's count from seven to six. This gate read it as
#: "pinned by digest" and passed, because until now every string after
#: `sha256:` was accepted as proof.
EMPTY_CONTENT_DIGEST = "sha256:" + "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def digest_defect(digest: str) -> Optional[str]:
    """Why this digest is not evidence of a specific image, or None if it is.

    Stated positively, as the tag rule above is: a digest is evidence when it
    is well formed and could be the hash of something. Whether it is the hash
    of *this* image is a question only the registry can answer, and this gate
    runs offline — but the two forms below are answerable here, and both are
    what a placeholder actually looks like.

    A digest of one repeated character (`sha256:aaa…`) is deliberately *not*
    rejected. It is the fixture this repository's own tests use to mean "some
    valid digest", and a rule that failed them would be teaching the wrong
    lesson for a defect that has never occurred here. The one that did occur is
    below.
    """
    normalized = digest.strip().lower()

    if not DIGEST_FORM.match(normalized):
        return (
            f"`{digest}` is not a resolvable digest — a digest is `sha256:` and "
            "exactly 64 hex characters, so this pins nothing"
        )

    if normalized == EMPTY_CONTENT_DIGEST:
        return (
            f"`{digest}` is the digest of empty content. No image manifest is "
            "empty, so this names no image; it is a filled-in field, not a build"
        )

    return None


def is_immutable_tag(tag: str) -> bool:
    """Does this tag name one specific build?

    The whole rule, stated positively. Everything that is not a digest, a
    version or a build identity is mutable — including every word a denylist
    would have had to think of in advance.
    """
    if not tag:
        return False
    if tag.startswith("sha256:"):
        return digest_defect(tag) is None
    return bool(VERSION_TAG.match(tag) or BUILD_TAG.match(tag))


class ImageTagError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass(frozen=True)
class ImageRef:
    """One image reference as it will actually be deployed.

    `reference` is the value after the directory's Kustomize `images:` overlay
    has been applied, because that overlay is what Argo CD renders and the
    cluster pulls. Judging the raw `image:` line instead would fail
    `quick-pick-survey`, which writes an untagged name in `deployment.yaml` and
    pins the digest in `kustomization.yaml` — the correct pattern, and the one
    this repository's own promotion script maintains.
    """

    path: str
    reference: str
    mutable: bool
    why: str
    declared: str = ""

    def format(self) -> str:
        origin = "" if self.declared in ("", self.reference) else f" (declared `{self.declared}`)"
        return f"{self.path}: {self.reference}{origin} — {self.why}"


@dataclass(frozen=True)
class Finding:
    code: str
    message: str

    def format(self) -> str:
        return f"ERROR [{self.code}] {self.message}"


def split_reference(reference: str) -> tuple[str, Optional[str], Optional[str]]:
    """Splits an image reference into (name, tag, digest).

    The colon in a registry's port (`registry:5000/app`) is not a tag
    separator, so the tag is looked for after the final slash only.
    """
    if "@" in reference:
        name, _, digest = reference.partition("@")
        return name, None, digest

    last_slash = reference.rfind("/")
    tail = reference[last_slash + 1 :]
    if ":" in tail:
        tag = tail.rpartition(":")[2]
        return reference[: reference.rfind(":")], tag, None
    return reference, None, None


def classify(reference: str) -> tuple[bool, str]:
    """Returns (is_mutable, why)."""
    _, tag, digest = split_reference(reference)

    if digest:
        defect = digest_defect(digest)
        if defect:
            # A digest-shaped string used to end the check here. Reporting it as
            # mutable is what makes the overlay fail the gate rather than
            # silently satisfy it and retire itself from the exception register.
            return True, defect
        return False, "pinned by digest"
    if tag is None:
        # Kubernetes defaults an absent tag to `latest`, so this is the same
        # defect as writing it out, and easier to miss in review.
        return True, "no tag, which Kubernetes resolves as :latest"
    if is_immutable_tag(tag.lower()):
        return False, f"pinned to :{tag}"
    return (
        True,
        f":{tag} is not immutable evidence — it names no build, no version and no "
        "digest, so the running code cannot be identified from it",
    )


def _walk_images(node: Any, found: List[str]) -> None:
    """Collects every `image:` string value anywhere in a parsed document."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "image" and isinstance(value, str) and value.strip():
                found.append(value.strip())
            else:
                _walk_images(value, found)
    elif isinstance(node, list):
        for item in node:
            _walk_images(item, found)


def load_overlay(directory: Path) -> Dict[str, Dict[str, str]]:
    """The directory's Kustomize `images:` overrides, keyed by matched name.

    Only the fields that decide mutability are read: `newName`, `newTag` and
    `digest`.
    """
    kustomization = directory / "kustomization.yaml"
    if not kustomization.is_file():
        return {}
    try:
        data = yaml.safe_load(kustomization.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ImageTagError(f"{kustomization}: could not parse as YAML: {exc}") from exc

    overrides: Dict[str, Dict[str, str]] = {}
    for entry in data.get("images") or []:
        if not isinstance(entry, dict) or "name" not in entry:
            continue
        overrides[str(entry["name"])] = {
            key: str(entry[key]) for key in ("newName", "newTag", "digest") if key in entry
        }
    return overrides


def apply_overlay(reference: str, overrides: Dict[str, Dict[str, str]]) -> str:
    """The reference Kustomize will render for this image, or it unchanged."""
    name, tag, digest = split_reference(reference)
    override = overrides.get(name)
    if override is None:
        return reference

    resolved = override.get("newName", name)
    if "digest" in override:
        return f"{resolved}@{override['digest']}"
    if "newTag" in override:
        return f"{resolved}:{override['newTag']}"
    if digest:
        return f"{resolved}@{digest}"
    return f"{resolved}:{tag}" if tag else resolved


def scan_manifests(repo_root: Path, scan_root: str = SCAN_ROOT) -> List[ImageRef]:
    """Every effective image reference under `scan_root`, in sorted path order."""
    root = repo_root / scan_root
    if not root.is_dir():
        raise ImageTagError(f"nothing to scan: {scan_root} is not a directory")

    refs: List[ImageRef] = []
    for path in sorted(root.rglob("*.yaml")) + sorted(root.rglob("*.yml")):
        if path.name == "kustomization.yaml":
            # Read as an overlay for its own directory, not as a workload.
            continue
        relative = path.relative_to(repo_root).as_posix()
        try:
            documents = list(yaml.safe_load_all(path.read_text(encoding="utf-8")))
        except yaml.YAMLError as exc:
            # Unparseable is not clean. A manifest nobody can read is a manifest
            # nobody checked.
            raise ImageTagError(f"{relative}: could not parse as YAML: {exc}") from exc

        images: List[str] = []
        for document in documents:
            _walk_images(document, images)

        overrides = load_overlay(path.parent)
        for declared in images:
            reference = apply_overlay(declared, overrides)
            mutable, why = classify(reference)
            refs.append(
                ImageRef(
                    path=relative,
                    reference=reference,
                    mutable=mutable,
                    why=why,
                    declared=declared,
                )
            )

    if not refs:
        raise ImageTagError(
            f"scanned {scan_root} and found no image references at all; "
            "the scan is broken, not the manifests"
        )
    return sorted(refs, key=lambda ref: (ref.path, ref.reference))


def scan_terraform_surface(repo_root: Path) -> List[ImageRef]:
    """The same judgement, applied to what `platform/terraform/` deploys.

    An image reference terraform builds out of an expression this repository
    cannot resolve — `each.value.tag`, fed from an untracked `terraform.tfvars`
    — is reported as mutable, not skipped. "The control cannot see it" and "the
    control approves of it" must never be the same outcome, and the tfvars file
    is not something a control may open: it holds live credentials.
    """
    try:
        images = scan_terraform(repo_root)
    except TerraformSurfaceError as exc:
        raise ImageTagError(str(exc)) from exc

    refs: List[ImageRef] = []
    for image in images:
        if not image.resolved:
            mutable, why = True, (
                "not resolvable from tracked sources, so nothing here shows it is "
                f"immutable — {image.origin}"
            )
        else:
            mutable, why = classify(image.reference)
            why = f"{why} — {image.origin}"
        refs.append(
            ImageRef(
                path=image.path,
                reference=f"{image.reference} (line {image.line})",
                mutable=mutable,
                why=why,
                declared=image.declared,
            )
        )
    return refs


def scan(repo_root: Path, scan_root: str = SCAN_ROOT) -> List[ImageRef]:
    """Every image reference on every deployment surface this repository tracks.

    Two surfaces, because there are two: `platform/k8s/` reconciled by Argo CD,
    and `platform/terraform/` applied by `.gitea/workflows/terraform-apply.yml`.
    Reading one of them and calling the result an audit is how a `:latest`
    code-server stayed invisible on a public ingress.
    """
    return scan_manifests(repo_root, scan_root) + scan_terraform_surface(repo_root)


def load_exceptions(repo_root: Path, path: str = EXCEPTIONS_PATH) -> List[Dict[str, Any]]:
    full = repo_root / path
    if not full.is_file():
        raise ImageTagError(f"exception file not found: {path}")
    try:
        data = yaml.safe_load(full.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ImageTagError(f"{path}: could not parse as YAML: {exc}") from exc

    entries = data.get("exceptions") or []
    if not isinstance(entries, list):
        raise ImageTagError(f"{path}: `exceptions` must be a list")

    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ImageTagError(f"{path}: entry {index} is not a mapping")
        missing = [field for field in REQUIRED_FIELDS if field not in entry]
        if missing:
            raise ImageTagError(
                f"{path}: entry {entry.get('id', index)} is missing {', '.join(missing)}"
            )
        if not isinstance(entry["count"], int) or entry["count"] < 0:
            raise ImageTagError(
                f"{path}: entry {entry['id']} has a non-integer count; "
                "an exception whose size is not recorded grows for free"
            )
    return entries


def check_expiry(entries: Sequence[Dict[str, Any]], today: date, path: str = EXCEPTIONS_PATH) -> List[Finding]:
    findings: List[Finding] = []
    for entry in entries:
        raw = entry["expires"]
        expires = raw if isinstance(raw, date) else None
        if expires is None:
            try:
                expires = datetime.strptime(str(raw), "%Y-%m-%d").date()
            except ValueError:
                findings.append(
                    Finding("exception-bad-date", f"{entry['id']}: `expires: {raw}` is not YYYY-MM-DD")
                )
                continue
        if expires < today:
            findings.append(
                Finding(
                    "exception-expired",
                    f"{entry['id']} expired on {expires}. Pin the images or re-argue the exception in {path}.",
                )
            )
        elif expires > today + timedelta(days=MAX_EXPIRY_DAYS):
            findings.append(
                Finding(
                    "exception-too-long",
                    f"{entry['id']} expires {expires}, more than {MAX_EXPIRY_DAYS} days out.",
                )
            )
    return findings


def audit(repo_root: Path, today: Optional[date] = None) -> List[Finding]:
    """The gate. Returns findings; an empty list is a pass."""
    today = today or date.today()
    refs = scan(repo_root)
    entries = load_exceptions(repo_root)

    findings = check_expiry(entries, today)

    mutable = [ref for ref in refs if ref.mutable]
    # Entries are matched in file order and each reference is claimed once, so a
    # specific entry above a broad one behaves the way it reads.
    unclaimed = list(mutable)
    for entry in entries:
        pattern = entry["path"]
        claimed = [ref for ref in unclaimed if fnmatch.fnmatch(ref.path, pattern)]
        actual = len(claimed)
        declared = entry["count"]
        if actual > declared:
            findings.append(
                Finding(
                    "exception-count-high",
                    f"{entry['id']} accepts {declared} mutable reference(s) under `{pattern}` "
                    f"but {actual} exist. New ones:\n        "
                    + "\n        ".join(ref.format() for ref in claimed[declared:]),
                )
            )
        elif actual < declared:
            findings.append(
                Finding(
                    "exception-count-low",
                    f"{entry['id']} accepts {declared} mutable reference(s) under `{pattern}` "
                    f"but only {actual} exist. Images were pinned — lower the count.",
                )
            )
        for ref in claimed:
            unclaimed.remove(ref)

    for ref in unclaimed:
        findings.append(
            Finding(
                "mutable-image-tag",
                f"{ref.format()}\n        -> Pin it to a digest or an immutable tag, or register "
                f"it in {EXCEPTIONS_PATH} with an owner, a reason and an expiry.",
            )
        )
    return findings


def format_report(repo_root: Path, findings: Sequence[Finding]) -> str:
    refs = scan(repo_root)
    pinned = sum(1 for ref in refs if not ref.mutable)
    terraform = sum(1 for ref in refs if ref.path.startswith(TERRAFORM_ROOT))
    lines = [
        "=== Container Image Tag Audit ===",
        f"{len(refs)} image reference(s) across both deployment surfaces "
        f"({len(refs) - terraform} under {SCAN_ROOT}, {terraform} under {TERRAFORM_ROOT}): "
        f"{pinned} pinned, {len(refs) - pinned} mutable.",
    ]
    if not findings:
        lines.append("Every mutable reference is registered, counted and unexpired.")
        return "\n".join(lines)
    lines.append("")
    lines.extend(finding.format() for finding in findings)
    lines.append("")
    lines.append(f"image tag audit: {len(findings)} error(s). See {EXCEPTIONS_PATH}.")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Fail when any tracked deployment surface — Kubernetes manifests or "
            "terraform — deploys an image reference that is not immutable evidence."
        )
    )
    parser.add_argument("--repo-root", default=None, help="repository root (default: two levels up)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        findings = audit(repo_root)
    except ImageTagError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    report = format_report(repo_root, findings)
    if findings:
        print(report, file=sys.stderr)
        return 1
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
