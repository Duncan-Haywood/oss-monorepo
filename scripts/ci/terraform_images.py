#!/usr/bin/env python3
"""The container images `platform/terraform/` deploys, read from tracked sources.

`platform/k8s/` is not the only thing that puts a container in this cluster.
`platform/terraform/` renders the same `helm/web-service` chart for every entry
in `var.services`, for the dashboard portal, for Tailscale, for the Pairwise
database and for two `code-server` releases — and until this module existed, no
control in the repository read a single line of it. `scripts/ci/image_tags.py`
hardcoded `SCAN_ROOT = "platform/k8s"` and `scripts/ci/image_release_path.py`
opened `platform/k8s/apps/*/deployment.yaml`. Half the deployment surface was
outside every gate, which is how a `codercom/code-server` at `:latest` came to
sit on a public Traefik ingress without anything objecting: a code-server is a
remote shell, and `:latest` means nobody can say which one is running.

What this reads, and what it refuses to read
--------------------------------------------

Read:

  * every `*.tf` file under `platform/terraform/`, for `image = "<literal>"`
    attributes and for the `image = { repository = …, tag = … }` blocks that the
    `helm_release` resources pass through `yamlencode`;
  * `variable` blocks, for the defaults those attributes resolve to — because
    `tag = optional(string, "latest")` in `variables.tf` is not a detail of a
    type signature, it is the tag every service that forgets to declare one
    actually gets;
  * `helm/*/values.yaml`, whose `image:` mapping is the chart's fallback and
    therefore a real deployed reference;
  * `helm/*/templates/**`, but only to confirm that every `image:` line in them
    is filled from `.Values` rather than hardcoded. A Helm template is Go
    text/template, not YAML; parsing it as YAML would fail, and *skipping* it
    because it fails to parse is exactly the fail-open this module exists to
    close. So it is checked with the rule that actually applies to it.

Never read, at any point, by any code path:

  * `*.tfvars`, `*.tfvars.json`, `*.tfstate*` and anything under `.terraform/`.
    `platform/terraform/terraform.tfvars` is untracked and holds live
    credentials. A control has no business opening it, and
    `tests/test_terraform_images.py` asserts that it is never opened even when
    one is placed in the scanned tree.

The consequence of that last refusal is honest and deliberate: the value of
`var.services` lives only in that file, so this module cannot resolve
`each.value.tag` to anything. It reports the reference as *unresolved* rather
than guessing, and the callers treat unresolved as not-pinned. A reference this
repository cannot show to be immutable is not a reference this repository may
call immutable.

Resolution is deliberately small. Exactly two forms are followed, because two
are enough for the surface that exists and a general HCL evaluator would be a
second, unreviewed terraform implementation:

  * `var.<name>` -> that variable's literal `default`, when it has one;
  * `each.value.<attr>` -> the `optional(<type>, "<literal>")` default declared
    for `<attr>` inside the variable named by the enclosing block's `for_each`.

Anything else — a ternary, an interpolation, a `local`, a variable with no
default — is unresolved, and unresolved is reported, never dropped.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml

TERRAFORM_ROOT = "platform/terraform"

#: Files a control must never open. `terraform.tfvars` carries a live Hetzner
#: token, database passwords and an admin key; `*.tfstate` carries every
#: resource attribute including the sensitive ones. Neither is needed to answer
#: "which images does this configuration deploy", and reading a secret in order
#: to audit a tag would be a worse defect than the one being audited.
REFUSED_SUFFIXES = (".tfvars", ".tfvars.json", ".tfstate", ".tfstate.backup")
REFUSED_DIRECTORIES = (".terraform",)

#: `image` on these resource types is a machine image, not a container image.
#: `hcloud_server.image = "ubuntu-24.04"` is the operating system of a VM. The
#: polarity matters: everything *not* named here is audited, so a new resource
#: type that does deploy a container is caught by default rather than missed.
MACHINE_IMAGE_RESOURCES = frozenset({"hcloud_server", "hcloud_image", "hcloud_snapshot"})

_RESOURCE_HEADER = re.compile(r'^\s*(resource|variable|module|data|locals|output)\b(?:\s+"([^"]+)")?(?:\s+"([^"]+)")?')
_IMAGE_LITERAL = re.compile(r'^\s*image\s*=\s*"([^"]*)"\s*$')
_IMAGE_BLOCK = re.compile(r"^\s*image\s*=\s*\{\s*$")
_ATTR = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$")
_STRING_LITERAL = re.compile(r'^"([^"$]*)"$')
_VAR_REFERENCE = re.compile(r"^var\.([A-Za-z_][A-Za-z0-9_]*)$")
_EACH_VALUE = re.compile(r"^each\.value\.([A-Za-z_][A-Za-z0-9_]*)$")
_OPTIONAL_DEFAULT = re.compile(r'^optional\(\s*[A-Za-z_(),\s]+?,\s*"([^"]*)"\s*\)$')
_FOR_EACH_VAR = re.compile(r"\bvar\.([A-Za-z_][A-Za-z0-9_]*)")


class TerraformSurfaceError(Exception):
    """A terraform surface that could not be read. Never reported as a pass."""


@dataclass(frozen=True)
class TerraformImage:
    """One container image reference declared in tracked terraform sources."""

    path: str
    line: int
    repository: str
    #: The tag, when it could be resolved to a literal from tracked sources.
    tag: Optional[str]
    digest: Optional[str]
    #: The source expression, kept verbatim so an unresolved finding names the
    #: thing an operator has to go and look at.
    declared: str
    origin: str
    #: The two halves are tracked apart because they answer different questions.
    #: An unresolved *tag* means the reference cannot be shown immutable. An
    #: unresolved *repository* additionally means this repository cannot tell
    #: whether it is supposed to build the image — `codercom/code-server` is
    #: plainly somebody else's to build; `each.value.image` might be anyone's.
    repository_resolved: bool = True
    tag_resolved: bool = True

    @property
    def resolved(self) -> bool:
        """Both halves determined from tracked sources."""
        return self.repository_resolved and self.tag_resolved

    @property
    def reference(self) -> str:
        """The reference as far as tracked sources can determine it."""
        if self.digest:
            return f"{self.repository}@{self.digest}"
        if self.tag is not None:
            return f"{self.repository}:{self.tag}"
        return self.repository

    def format(self) -> str:
        return f"{self.path}:{self.line}: {self.reference} ({self.origin})"


def is_refused(path: Path) -> bool:
    """True for the files no control may open."""
    if any(part in REFUSED_DIRECTORIES for part in path.parts):
        return True
    name = path.name
    return any(name == suffix.lstrip(".") or name.endswith(suffix) for suffix in REFUSED_SUFFIXES)


# ---------------------------------------------------------------------------
# variable blocks
# ---------------------------------------------------------------------------


def _parse_variables(lines: List[str]) -> Tuple[Dict[str, str], Dict[str, Dict[str, str]]]:
    """Returns (variable -> literal default, variable -> {attribute -> default}).

    The second mapping is what makes `variables.tf`'s
    `tag = optional(string, "latest")` visible: every service in `var.services`
    that omits a tag is deployed on that literal, so it is a real deployed
    reference and not a type annotation.
    """
    scalar_defaults: Dict[str, str] = {}
    object_defaults: Dict[str, Dict[str, str]] = {}

    current: Optional[str] = None
    depth = 0
    for raw in lines:
        header = _RESOURCE_HEADER.match(raw)
        if header and header.group(1) == "variable" and depth == 0:
            current = header.group(2)
            object_defaults.setdefault(current, {})
        if current is not None:
            attribute = _ATTR.match(raw)
            if attribute:
                name, expression = attribute.group(1), attribute.group(2)
                literal = _STRING_LITERAL.match(expression)
                if name == "default" and literal:
                    scalar_defaults[current] = literal.group(1)
                optional = _OPTIONAL_DEFAULT.match(expression)
                if optional:
                    object_defaults[current][name] = optional.group(1)
        depth += raw.count("{") - raw.count("}")
        if depth <= 0:
            depth = 0
            current = None
    return scalar_defaults, object_defaults


# ---------------------------------------------------------------------------
# .tf image references
# ---------------------------------------------------------------------------


@dataclass
class _Resolver:
    scalar_defaults: Dict[str, str]
    object_defaults: Dict[str, Dict[str, str]]

    def resolve(self, expression: str, for_each_var: Optional[str]) -> Optional[str]:
        expression = expression.rstrip(",").strip()
        literal = _STRING_LITERAL.match(expression)
        if literal:
            return literal.group(1)
        variable = _VAR_REFERENCE.match(expression)
        if variable:
            return self.scalar_defaults.get(variable.group(1))
        each = _EACH_VALUE.match(expression)
        if each and for_each_var:
            return self.object_defaults.get(for_each_var, {}).get(each.group(1))
        return None


def _scan_tf_file(relative: str, text: str, resolver: _Resolver) -> List[TerraformImage]:
    lines = text.splitlines()
    found: List[TerraformImage] = []

    block_type: Optional[str] = None
    block_name: Optional[str] = None
    for_each_var: Optional[str] = None
    depth = 0

    index = 0
    while index < len(lines):
        raw = lines[index]
        header = _RESOURCE_HEADER.match(raw)
        if header and depth == 0:
            block_type = header.group(1)
            block_name = header.group(2)
            for_each_var = None

        if block_type == "resource" and re.match(r"^\s*for_each\s*=", raw):
            # `for_each` may span several lines; read until the braces balance.
            chunk = raw
            balance = raw.count("{") - raw.count("}")
            look = index
            while balance > 0 and look + 1 < len(lines):
                look += 1
                chunk += "\n" + lines[look]
                balance += lines[look].count("{") - lines[look].count("}")
            match = _FOR_EACH_VAR.search(chunk)
            if match:
                for_each_var = match.group(1)

        auditable = block_type == "resource" and block_name not in MACHINE_IMAGE_RESOURCES

        literal = _IMAGE_LITERAL.match(raw)
        if literal and auditable:
            repository, tag, digest = split_reference(literal.group(1))
            found.append(
                TerraformImage(
                    path=relative,
                    line=index + 1,
                    repository=repository,
                    tag=tag,
                    digest=digest,
                    declared=literal.group(1),
                    origin=f'literal `image` on resource "{block_name}"',
                )
            )
        elif _IMAGE_BLOCK.match(raw) and auditable:
            found.append(
                _read_image_block(relative, lines, index, resolver, for_each_var, block_name)
            )

        depth += raw.count("{") - raw.count("}")
        if depth <= 0:
            depth = 0
            block_type = block_name = None
        index += 1

    return found


def _read_image_block(
    relative: str,
    lines: List[str],
    start: int,
    resolver: _Resolver,
    for_each_var: Optional[str],
    block_name: Optional[str],
) -> TerraformImage:
    """The `image = { repository = …, tag = … }` mapping helm_release passes on."""
    attributes: Dict[str, str] = {}
    depth = 1
    index = start
    while depth > 0 and index + 1 < len(lines):
        index += 1
        raw = lines[index]
        depth += raw.count("{") - raw.count("}")
        if depth <= 0:
            break
        attribute = _ATTR.match(raw)
        if attribute and attribute.group(1) in ("repository", "tag", "digest"):
            attributes[attribute.group(1)] = attribute.group(2).rstrip(",").strip()

    declared_repository = attributes.get("repository", "")
    declared_tag = attributes.get("tag", "")
    declared_digest = attributes.get("digest", "")

    repository = resolver.resolve(declared_repository, for_each_var) if declared_repository else None
    tag = resolver.resolve(declared_tag, for_each_var) if declared_tag else None
    digest = resolver.resolve(declared_digest, for_each_var) if declared_digest else None

    unresolved = []
    if declared_repository and repository is None:
        unresolved.append(f"repository = {declared_repository}")
    if declared_tag and tag is None and digest is None:
        unresolved.append(f"tag = {declared_tag}")
    if not declared_tag and not declared_digest:
        # Helm renders `{{ .Values.image.tag }}` into the reference, so an image
        # block with no tag at all is `repo:` — not a tag omitted, a tag empty.
        unresolved.append("no tag declared")

    origin = f'`image` block on resource "{block_name}"'
    if unresolved:
        origin += "; unresolved from tracked sources: " + ", ".join(unresolved)

    declared = (
        f"repository = {declared_repository or '(absent)'}, "
        f"tag = {declared_tag or declared_digest or '(absent)'}"
    )
    return TerraformImage(
        path=relative,
        line=start + 1,
        repository=repository if repository is not None else f"<{declared_repository}>",
        tag=tag,
        digest=digest,
        declared=declared,
        origin=origin,
        repository_resolved=repository is not None,
        tag_resolved=not unresolved,
    )


# ---------------------------------------------------------------------------
# helm chart surfaces
# ---------------------------------------------------------------------------


def _scan_values(relative: str, text: str) -> List[TerraformImage]:
    try:
        document = yaml.safe_load(text) or {}
    except yaml.YAMLError as error:
        raise TerraformSurfaceError(f"{relative}: could not parse as YAML: {error}") from error
    if not isinstance(document, dict):
        return []
    image = document.get("image")
    if not isinstance(image, dict):
        return []
    repository = str(image.get("repository", ""))
    tag = image.get("tag")
    digest = image.get("digest")
    return [
        TerraformImage(
            path=relative,
            line=1,
            repository=repository,
            tag=None if tag is None else str(tag),
            digest=None if digest is None else str(digest),
            declared=f"{repository}:{tag}",
            origin="chart default values; every release that does not override `image` runs this",
            repository_resolved=repository != "",
            tag_resolved=repository != "",
        )
    ]


def _check_template(relative: str, text: str) -> None:
    """A Helm template's `image:` must come from `.Values`, never a literal.

    The template is Go text/template and does not parse as YAML. Skipping it for
    that reason would leave a hardcoded `image: evil:latest` in a chart entirely
    unaudited, so the rule that applies to a template is applied instead: the
    reference must be interpolated, and the values that interpolate it are read
    above.
    """
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not re.match(r"^-?\s*image:\s*\S", stripped):
            continue
        if "{{" not in stripped:
            raise TerraformSurfaceError(
                f"{relative}:{number}: a chart template hardcodes an image reference "
                f"({stripped!r}). A template's image must be filled from `.Values` so "
                "the reference is auditable where the values are declared."
            )


# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------


def split_reference(reference: str) -> Tuple[str, Optional[str], Optional[str]]:
    """(name, tag, digest). A registry port's colon is not a tag separator."""
    if "@" in reference:
        name, _, digest = reference.partition("@")
        return name, None, digest
    last_slash = reference.rfind("/")
    tail = reference[last_slash + 1 :]
    if ":" in tail:
        return reference[: reference.rfind(":")], tail.rpartition(":")[2], None
    return reference, None, None


def scan_terraform(repo_root: Path, root: str = TERRAFORM_ROOT) -> List[TerraformImage]:
    """Every container image reference tracked terraform sources can deploy.

    Returns an empty list when the directory does not exist — a repository with
    no terraform has no terraform surface. It does *not* return an empty list
    when the directory exists and cannot be read; that is an error, and
    `image_tags.py` additionally asserts against this repository that the
    surface is non-empty, so the reader cannot quietly stop reaching it.
    """
    base = repo_root / root
    if not base.is_dir():
        return []

    sources = sorted(p for p in base.rglob("*.tf") if not is_refused(p))
    if not sources:
        raise TerraformSurfaceError(
            f"{root} exists but holds no .tf sources; the scan is broken, not the configuration"
        )

    texts: Dict[Path, str] = {}
    for path in sources:
        try:
            texts[path] = path.read_text(encoding="utf-8")
        except OSError as error:
            raise TerraformSurfaceError(f"{path}: could not read: {error}") from error

    scalar_defaults: Dict[str, str] = {}
    object_defaults: Dict[str, Dict[str, str]] = {}
    for path, text in texts.items():
        scalars, objects = _parse_variables(text.splitlines())
        scalar_defaults.update(scalars)
        for name, attributes in objects.items():
            object_defaults.setdefault(name, {}).update(attributes)
    resolver = _Resolver(scalar_defaults, object_defaults)

    found: List[TerraformImage] = []
    for path, text in texts.items():
        found.extend(_scan_tf_file(path.relative_to(repo_root).as_posix(), text, resolver))

    for values in sorted(base.glob("helm/*/values.yaml")):
        if is_refused(values):
            continue
        relative = values.relative_to(repo_root).as_posix()
        try:
            text = values.read_text(encoding="utf-8")
        except OSError as error:
            raise TerraformSurfaceError(f"{relative}: could not read: {error}") from error
        found.extend(_scan_values(relative, text))

    for template in sorted(base.glob("helm/*/templates/**/*")):
        if not template.is_file() or is_refused(template):
            continue
        relative = template.relative_to(repo_root).as_posix()
        try:
            _check_template(relative, template.read_text(encoding="utf-8"))
        except OSError as error:
            raise TerraformSurfaceError(f"{relative}: could not read: {error}") from error

    return sorted(found, key=lambda image: (image.path, image.line))
