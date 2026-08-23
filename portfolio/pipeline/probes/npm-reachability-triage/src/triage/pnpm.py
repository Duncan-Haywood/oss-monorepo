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

## The direction a gap in this module runs, and the guard on it

Deriving dev-ness rather than reading it introduces a failure npm's stored
flag cannot have: an edge this module fails to follow makes a package look
*less* reachable than it is, and that ends in a false suppression — the one
outcome this probe exists to avoid.

So an unfollowable production-side edge is never simply dropped. A ``link:``
pointing outside the workspace, a tarball or git URL, a snapshot key the
lockfile omits: each forces every install of the package it named onto the
production graph, and each is reported in
:attr:`PnpmProject.unresolved_production_edges` so the record can say the
graph was incomplete instead of presenting a narrowed answer as a complete
one.

## The dependency graph, added 2026-08-23

This module originally returned install locations only, and the CLI passed no
dependency graph for a pnpm project — so ``graph.py``'s build-surface rule
(the ``next`` → ``postcss`` reasoning that took the static-export residual
from 11 to 2 on the npm side) did not exist here. It does now, and it needed
no pnpm-specific version: the rule is keyed on package *names*, so all it
wanted was a graph whose locations resolve to names.

That last part is the only thing pnpm made awkward. npm's locations are
filesystem paths, so ``DependencyGraph.name_of`` reads the name off the end
of one; pnpm's are content identities, where the name is not the last segment
of anything. Left to that heuristic every edge lookup would miss and the rule
would silently stop firing rather than fail, so this module states the names
directly in :attr:`triage.graph.DependencyGraph.names`.

## What this module deliberately does not do

It has only been validated against ``lockfileVersion`` major version ``9`` —
the version this portfolio's own pnpm venture uses. Unlike ``eaa-wcag-triage``
or the npm side of this probe, this module's precision has not been checked
against a hand-labelled advisory set; treat its output as structurally sound
(tested against the real ``retail-pilot-intel`` lockfile and a battery of
synthetic cases) rather than accuracy-validated. Reading this format widened
the gap between what the tool reads and what anyone has hand-verified, from
9-of-9 to 7-of-16, and ``evidence.ACCURACY_NOTE`` says so.
"""

from __future__ import annotations

import posixpath
from dataclasses import dataclass
from pathlib import Path

import yaml

from .graph import ROOT, DependencyGraph
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


@dataclass(frozen=True)
class _Traversal:
    """What one walk outward from an importer's roots found."""

    #: Every snapshot key reached.
    snapshots: set[str]
    #: ``(dependent node, target node)`` pairs, as graph location strings. The
    #: analysed importer is :data:`triage.graph.ROOT`; another workspace member
    #: is its importer path; a package is its snapshot key.
    edges: set[tuple[str, str]]
    #: Package names on an edge that named nothing this module could follow —
    #: a ``link:`` outside the workspace, a tarball or git URL, or a snapshot
    #: key the lockfile does not carry.
    unresolved: set[str]


def _traverse(
    roots: dict[str, str],
    importer_path: str,
    importers: dict,
    snapshots: dict,
) -> _Traversal:
    """Walk outward from ``roots`` (an importer's own ``name -> version`` map).

    Follows ``link:`` edges into other importers' own production dependencies
    and ordinary edges through ``snapshots``. Two kinds of node are walked —
    snapshot keys and importer paths — kept in one visited set with distinct
    prefixes so a workspace member and a same-named snapshot key can never
    collide.

    Alongside the reachable set it records the edges it walked, which is what
    makes the build-surface rule in :mod:`triage.graph` usable here, and the
    edges it could **not** walk. The second one is not bookkeeping: dev-ness is
    derived from reachability rather than read from a flag, so an edge this
    module fails to follow makes a package look *less* reachable than it is,
    and that direction ends in a false suppression. Naming them lets the caller
    fail towards reporting and lets the record say the graph was incomplete.
    """
    visited: set[str] = set()
    reached_snapshots: set[str] = set()
    edges: set[tuple[str, str]] = set()
    unresolved: set[str] = set()
    stack: list[tuple[str, str]] = []

    def push_edges(declared: dict[str, str], source: str, from_importer: str) -> None:
        for name, version in declared.items():
            if version.startswith(_LINK_PREFIX):
                target = _resolve_link(from_importer, version)
                if target not in importers:
                    # A link out of the workspace: the target's own dependency
                    # set is not in this lockfile, so everything behind it is
                    # invisible here rather than absent.
                    unresolved.add(name)
                    continue
                edges.add((source, target))
                stack.append(("importer", target))
                continue
            key = f"{name}@{version}"
            if key not in snapshots:
                # A tarball, a git URL, or a snapshot the lockfile omits. It is
                # still emitted as a component below — dropping it would lose a
                # finding — but nothing behind it can be walked.
                unresolved.add(name)
            edges.add((source, key))
            stack.append(("snapshot", key))

    push_edges(roots, ROOT, importer_path)

    while stack:
        kind, key = stack.pop()
        marker = f"{kind}:{key}"
        if marker in visited:
            continue
        visited.add(marker)

        if kind == "importer":
            declared = _importer_dependency_entries(
                importers.get(key), _PRODUCTION_FIELDS
            )
            push_edges(declared, key, key)
            continue

        # kind == "snapshot"
        reached_snapshots.add(key)
        push_edges(_snapshot_edges(snapshots.get(key)), key, importer_path)

    return _Traversal(reached_snapshots, edges, unresolved)


@dataclass(frozen=True)
class PnpmProject:
    """One importer resolved: its install locations and its production graph."""

    importer_path: str
    installed: tuple[InstalledPackage, ...]
    #: Production dependency edges, in the shape :mod:`triage.graph`'s
    #: build-surface rule consumes. It is keyed on package names, so it needs no
    #: pnpm-specific version — only a graph whose locations resolve to names,
    #: which :attr:`triage.graph.DependencyGraph.names` supplies.
    graph: DependencyGraph
    #: Package names on a production-side edge this module could not follow.
    #: Non-empty means the graph is incomplete and the answer was widened, not
    #: narrowed — see :func:`_traverse`.
    unresolved_production_edges: tuple[str, ...] = ()


def analyse(raw: dict, importer_path: str = ".") -> PnpmProject:
    """Resolve one importer of an already-decoded pnpm lockfile.

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

    production = _traverse(prod_roots, importer_path, importers, snapshots)
    development = _traverse(dev_roots, importer_path, importers, snapshots)

    prod_reachable = set(production.snapshots)
    all_reachable = prod_reachable | development.snapshots

    # An edge that could not be followed is not evidence of absence. Force every
    # install of the package it named onto the production graph, so a gap in
    # this reader can only ever widen the answer. Without this, a package whose
    # only *followable* path runs through a devDependency reads as dev-only and
    # every finding on it is suppressed.
    if production.unresolved:
        for key in all_reachable:
            split = _split_name_version(_base_key(key))
            if split is not None and split[0] in production.unresolved:
                prod_reachable.add(key)

    installed: list[InstalledPackage] = []
    names: dict[str, str] = {}
    for key in sorted(all_reachable):
        split = _split_name_version(_base_key(key))
        if split is None:
            continue
        name, version = split
        names[key] = name
        snapshot = snapshots.get(key)
        installed.append(
            InstalledPackage(
                name=name,
                version=version,
                path=key,
                dev=key not in prod_reachable,
                optional=bool(
                    isinstance(snapshot, dict) and snapshot.get("optional", False)
                ),
            )
        )

    dev_locations = all_reachable - prod_reachable
    dependents: dict[str, set[str]] = {}
    for source, target in production.edges:
        if source in dev_locations:
            # Mirrors `graph.build_from_lockfile_data`: a dev-only location
            # cannot put anything on the production graph.
            continue
        dependents.setdefault(target, set()).add(source)

    # Every node the graph mentions, not only the packages: a workspace member
    # reached through `link:` is an edge endpoint with no snapshot of its own,
    # and leaving it out would make the graph disagree with its own edges.
    locations = {ROOT} | all_reachable
    for source, target in production.edges:
        locations.add(source)
        locations.add(target)
    graph = DependencyGraph(
        locations=frozenset(locations),
        dependents={key: frozenset(value) for key, value in dependents.items()},
        dev_locations=frozenset(dev_locations),
        names=names,
    )

    return PnpmProject(
        importer_path=importer_path,
        installed=tuple(installed),
        graph=graph,
        unresolved_production_edges=tuple(sorted(production.unresolved)),
    )


def parse_pnpm_lockfile_data(
    raw: dict, importer_path: str = "."
) -> list[InstalledPackage]:
    """The install locations :func:`analyse` resolves, for callers wanting only those."""
    return list(analyse(raw, importer_path).installed)


def load(path: str | Path, importer_path: str = ".") -> PnpmProject:
    """Read a ``pnpm-lock.yaml`` file and resolve one importer from it."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise UnsupportedPnpmLockfile("pnpm lockfile is not a mapping")
    return analyse(raw, importer_path)


def parse_pnpm_lockfile(
    path: str | Path, importer_path: str = "."
) -> list[InstalledPackage]:
    """Read a ``pnpm-lock.yaml`` file and parse one importer from it."""
    return list(load(path, importer_path).installed)


def importer_paths(raw: dict) -> list[str]:
    """Every workspace member path this lockfile declares, sorted.

    Used by ``discovery.py`` to tell a workspace member with no lockfile of
    its own from a directory this lockfile does not resolve at all.
    """
    importers = raw.get("importers")
    if not isinstance(importers, dict):
        return []
    return sorted(key for key in importers if isinstance(key, str))
