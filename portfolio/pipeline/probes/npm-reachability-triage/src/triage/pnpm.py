"""Parse a pnpm ``pnpm-lock.yaml`` into the same per-install-location shape
``lockfile.py`` produces for npm, so the rest of this package — ``engine.py``,
``evidence.py``, the CLI — needs no pnpm-specific branch.

Before this module existed, every pnpm project in a scanned repository was
refused outright (see ``discovery.REFUSAL_REMEDIES["pnpm-lockfile"]``): this
tool could read npm's ``package-lock.json`` and nothing else, so a pnpm
project produced no record at all rather than a wrong one. That is the safe
failure, but it is still a gap, not a fix — and it is a named one:
``retail-pilot-intel``, this portfolio's one pnpm venture, was reported
"remains unanalysed" in the npm probe's own coverage walk.

pnpm's lockfile is structured differently enough from npm's that the two
formats need genuinely separate reasoning, not a shared parser with a format
switch:

* npm keeps one ``dev`` flag *per install location* (a path like
  ``node_modules/next/node_modules/postcss``), because the same
  name+version can be installed at more than one path with different
  reachability. pnpm de-duplicates globally by content address instead —
  there is one node per distinct ``name@version(peer-suffix)``, called a
  *snapshot* — so pnpm's lockfile carries no ``dev`` flag on the snapshot at
  all. Whether a snapshot is production or dev-only is not a stored fact; it
  is a property of *which paths from which project's own dependency
  declarations reach it*, which this module computes by graph traversal
  rather than reading a field.
* npm's lockfile has one flat ``packages`` map for the whole tree, including
  workspace members, with per-location paths that already encode nesting.
  pnpm's ``importers`` map keeps one entry per workspace member, each with
  its own ``dependencies``/``devDependencies``, and cross-references another
  member with a ``link:../other`` version rather than a snapshot key. A
  member can be a production dependency of another (``packages/pos`` in
  ``retail-pilot-intel`` depends on ``packages/schemas``), and only that
  member's own *production* declarations should count towards the consumer's
  reachability — its devDependencies are not installed for a consumer.

## What "production-reachable" means here

For one importer (workspace member, or the lockfile root when there is no
workspace), the roots are its own ``dependencies`` and
``optionalDependencies`` entries. A snapshot is reached in production if it
is one of those roots, or is pulled in — via ``dependencies`` or
``optionalDependencies`` only, never ``devDependencies`` — by something
already reached. That mirrors ``PRODUCTION_DEPENDENCY_FIELDS`` in
``graph.py``, with one field absent on purpose: a snapshot entry carries no
``peerDependencies`` map of its own (a peer requirement that is actually
loaded already shows up as an ordinary ``dependencies`` entry on the
snapshot that needed it satisfied — see the module docstring's worked
example in the tests), so there is nothing extra to walk there.

A snapshot reachable from *only* the importer's own ``devDependencies`` is
reported ``dev=True``, the same meaning ``InstalledPackage.dev`` has for an
npm install location: every production and every failure to prove otherwise
still marks it ``dev=False``, because a wrongly-``dev`` snapshot is a false
suppression, and this module would rather report a devDependency as shipped
than mis-clear something that actually ships.

## What this module deliberately does not do yet

It has no pnpm equivalent of ``graph.py``'s build-surface rule (the
``next`` → ``postcss`` reasoning). That rule only ever moves a finding
*out* of "shipped", so its absence here cannot produce a false suppression —
it can only under-suppress, which is the direction this package always fails
towards. A pnpm project can still be suppressed by the dependency-path rule
this module feeds, and by the deployment-surface and dev-server rules in
``engine.py``, which read no lockfile format at all.

It has also only been validated against ``lockfileVersion`` major version
``9`` — the version this portfolio's own pnpm venture uses. Unlike
``eaa-wcag-triage`` or the npm side of this probe, this module's precision
has not been checked against a hand-labelled advisory set; treat its output
as structurally sound (tested against the real ``retail-pilot-intel``
lockfile and a battery of synthetic cases) rather than accuracy-validated.
"""

from __future__ import annotations

import posixpath
from pathlib import Path

import yaml

from .lockfile import InstalledPackage

#: The only lockfileVersion major version this module has been built and
#: tested against. A different major version may use a structure this parser
#: does not understand, so it refuses rather than silently misreading it.
SUPPORTED_MAJOR_VERSION = "9"

#: Fields that put a snapshot, or an importer's own dependency, on the
#: production graph. ``devDependencies`` is deliberately absent, the same way
#: it is absent from ``graph.PRODUCTION_DEPENDENCY_FIELDS``.
_PRODUCTION_FIELDS = ("dependencies", "optionalDependencies")

#: The prefix pnpm uses for a version that names another workspace member
#: instead of a registry release.
_LINK_PREFIX = "link:"


class UnsupportedPnpmLockfile(ValueError):
    """Raised for a pnpm lockfile this module cannot analyse."""


def major_version(raw: dict) -> str | None:
    """The lockfile's major ``lockfileVersion`` (``'9'`` for ``'9.0'``), or
    ``None`` if the field is absent. Public so ``discovery.py`` can classify a
    pnpm lockfile it finds without parsing it twice."""
    version = raw.get("lockfileVersion")
    if version is None:
        return None
    return str(version).split(".", 1)[0]


def _split_name_version(base_key: str) -> tuple[str, str] | None:
    """Split a peer-suffix-free snapshot key into ``(name, version)``.

    A scoped name (``@scope/name``) starts with ``@``, so the name/version
    boundary is the *second* ``@`` in that case rather than the first.
    """
    if not base_key:
        return None
    start = 1 if base_key.startswith("@") else 0
    index = base_key.find("@", start)
    if index == -1:
        return None
    name = base_key[:index]
    version = base_key[index + 1 :]
    if not name or not version:
        return None
    return name, version


def _base_key(snapshot_key: str) -> str:
    """Strip a snapshot key's peer-resolution suffix, e.g. the ``(...)`` tail
    on ``react-dom@19.2.8(react@19.2.8)``. What remains is the key the
    lockfile's ``packages`` map uses for the same release."""
    index = snapshot_key.find("(")
    return snapshot_key if index == -1 else snapshot_key[:index]


def _snapshot_edges(entry: object) -> dict[str, str]:
    """Every ``name -> resolved version string`` a snapshot entry installs
    on the production graph. See the module docstring for why
    ``peerDependencies`` is not one of the fields read here."""
    if not isinstance(entry, dict):
        return {}
    edges: dict[str, str] = {}
    for field_name in _PRODUCTION_FIELDS:
        declared = entry.get(field_name)
        if not isinstance(declared, dict):
            continue
        for name, version in declared.items():
            if isinstance(name, str) and isinstance(version, str):
                edges[name] = version
    return edges


def _importer_dependency_entries(importer: object, fields: tuple) -> dict[str, str]:
    """Every ``name -> resolved version string`` an importer declares under
    the given manifest fields (each entry is ``{specifier, version}``)."""
    if not isinstance(importer, dict):
        return {}
    edges: dict[str, str] = {}
    for field_name in fields:
        declared = importer.get(field_name)
        if not isinstance(declared, dict):
            continue
        for name, spec in declared.items():
            if not isinstance(name, str) or not isinstance(spec, dict):
                continue
            version = spec.get("version")
            if isinstance(version, str):
                edges[name] = version
    return edges


def _resolve_link(importer_path: str, version: str) -> str:
    """Resolve a ``link:../other`` version against the importer that declared
    it, to the importer path it names (matching an ``importers`` key)."""
    target = version[len(_LINK_PREFIX) :]
    joined = posixpath.normpath(posixpath.join(importer_path, target))
    return "." if joined in ("", ".") else joined


def _reachable_snapshots(
    roots: dict[str, str],
    importer_path: str,
    importers: dict,
    snapshots: dict,
) -> set[str]:
    """Every snapshot key reachable from ``roots`` (an importer's own
    ``name -> version`` map), following ``link:`` edges into other
    importers' own production dependencies and ordinary edges through
    ``snapshots``.

    Two kinds of node are walked — snapshot keys and importer paths — kept in
    one visited set with distinct prefixes so a workspace member and a
    same-named snapshot key can never collide.
    """
    visited: set[str] = set()
    reached_snapshots: set[str] = set()
    stack: list[tuple[str, str]] = []

    def push_edges(edges: dict[str, str], from_importer: str) -> None:
        for name, version in edges.items():
            if version.startswith(_LINK_PREFIX):
                target = _resolve_link(from_importer, version)
                stack.append(("importer", target))
            else:
                stack.append(("snapshot", f"{name}@{version}"))

    push_edges(roots, importer_path)

    while stack:
        kind, key = stack.pop()
        marker = f"{kind}:{key}"
        if marker in visited:
            continue
        visited.add(marker)

        if kind == "importer":
            edges = _importer_dependency_entries(
                importers.get(key), _PRODUCTION_FIELDS
            )
            push_edges(edges, key)
            continue

        # kind == "snapshot"
        reached_snapshots.add(key)
        edges = _snapshot_edges(snapshots.get(key))
        push_edges(edges, importer_path)

    return reached_snapshots


def parse_pnpm_lockfile_data(
    raw: dict, importer_path: str = "."
) -> list[InstalledPackage]:
    """Parse already-decoded pnpm lockfile YAML for one importer.

    ``importer_path`` is the workspace-relative path used as a key in the
    lockfile's own ``importers`` map (``"."`` for the lockfile root, or a
    monorepo path such as ``"packages/pos"``).
    """
    major = major_version(raw)
    if major != SUPPORTED_MAJOR_VERSION:
        raise UnsupportedPnpmLockfile(
            f"pnpm lockfileVersion {raw.get('lockfileVersion')!r} is not "
            f"supported; this module has only been validated against major "
            f"version {SUPPORTED_MAJOR_VERSION}"
        )

    importers = raw.get("importers")
    if not isinstance(importers, dict) or importer_path not in importers:
        raise UnsupportedPnpmLockfile(
            f"no importer {importer_path!r} in this lockfile's `importers` map"
        )
    snapshots = raw.get("snapshots")
    if not isinstance(snapshots, dict):
        raise UnsupportedPnpmLockfile("lockfile has no `snapshots` map")

    importer = importers[importer_path]
    prod_roots = _importer_dependency_entries(importer, _PRODUCTION_FIELDS)
    dev_roots = _importer_dependency_entries(importer, ("devDependencies",))

    prod_reachable = _reachable_snapshots(
        prod_roots, importer_path, importers, snapshots
    )
    dev_reachable = _reachable_snapshots(
        dev_roots, importer_path, importers, snapshots
    )

    installed: list[InstalledPackage] = []
    for key in sorted(prod_reachable | dev_reachable):
        split = _split_name_version(_base_key(key))
        if split is None:
            continue
        name, version = split
        installed.append(
            InstalledPackage(
                name=name,
                version=version,
                path=key,
                dev=key not in prod_reachable,
                optional=False,
            )
        )
    return installed


def parse_pnpm_lockfile(
    path: str | Path, importer_path: str = "."
) -> list[InstalledPackage]:
    """Read a ``pnpm-lock.yaml`` file and parse one importer from it."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise UnsupportedPnpmLockfile("pnpm lockfile is not a mapping")
    return parse_pnpm_lockfile_data(raw, importer_path)


def importer_paths(raw: dict) -> list[str]:
    """Every workspace member path this lockfile declares, sorted.

    Used by ``discovery.py`` to tell a workspace member with no lockfile of
    its own from a directory this lockfile does not resolve at all.
    """
    importers = raw.get("importers")
    if not isinstance(importers, dict):
        return []
    return sorted(key for key in importers if isinstance(key, str))
