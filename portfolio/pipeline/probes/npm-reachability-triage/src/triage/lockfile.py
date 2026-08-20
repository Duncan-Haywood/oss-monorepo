"""Parse an npm ``package-lock.json`` into per-install-location components.

The distinction this module exists to preserve is between a *package* and an
*install location*. Name-plus-version matching treats ``glob@10.3.10`` as one
thing; a lockfile may carry it at several distinct paths, some reachable from
the production dependency graph and some only from the dev graph.

That distinction accounted for 41 of the 95 false positives measured in
``portfolio/research/cra-advisory-reachability/`` — the largest single cause.
Collapsing install locations before matching is what loses it, so this parser
keeps every location separate and lets the triage stage collapse them.

Only lockfile versions 2 and 3 are supported. Version 1 lockfiles carry no
``packages`` map and therefore no per-location ``dev`` flag, so the analysis
this tool performs is not possible against them; :func:`parse_lockfile` raises
rather than silently degrading to name-level matching.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


class UnsupportedLockfile(ValueError):
    """Raised for a lockfile whose format this module cannot analyse."""


@dataclass(frozen=True)
class InstalledPackage:
    """One package as installed at one specific path in the dependency tree."""

    name: str
    version: str
    path: str
    dev: bool
    optional: bool

    @property
    def is_production(self) -> bool:
        """Whether this install location is reachable from the production graph."""
        return not self.dev


def _name_from_path(path: str) -> str | None:
    """Derive the package name from a lockfile ``packages`` key.

    Keys are install paths relative to the project root, e.g.
    ``node_modules/foo``, ``node_modules/a/node_modules/@scope/b``. The name is
    whatever follows the *last* ``node_modules/`` segment, which is what makes
    nested duplicate installs resolvable. Workspace entries (``packages/web``)
    have no ``node_modules`` segment and are not third-party components, so they
    return ``None``.
    """
    marker = "node_modules/"
    index = path.rfind(marker)
    if index == -1:
        return None
    name = path[index + len(marker) :]
    return name or None


def parse_lockfile(path: str | Path) -> list[InstalledPackage]:
    """Read ``path`` and return every third-party install location it declares.

    Entries without a ``version`` are skipped: these are link/workspace stubs
    that resolve elsewhere in the same file, so counting them would double-count
    the target they point at.
    """
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return parse_lockfile_data(raw)


def parse_lockfile_data(raw: dict) -> list[InstalledPackage]:
    """Parse already-decoded lockfile JSON. See :func:`parse_lockfile`."""
    version = raw.get("lockfileVersion")
    if version not in (2, 3):
        raise UnsupportedLockfile(
            f"lockfileVersion {version!r} is not supported; this tool requires "
            "2 or 3, which carry the per-install-location 'dev' flag that the "
            "dependency-path analysis depends on"
        )

    packages = raw.get("packages")
    if not isinstance(packages, dict):
        raise UnsupportedLockfile("lockfile has no 'packages' map")

    installed: list[InstalledPackage] = []
    for key, entry in packages.items():
        if not key or not isinstance(entry, dict):
            # "" is the root project itself, not a third-party component.
            continue
        name = _name_from_path(key)
        if name is None:
            continue
        version_text = entry.get("version")
        if not isinstance(version_text, str):
            continue

        # npm sets 'devOptional' for packages reachable from both a dev path and
        # an optional production path. Such a package can ship, so it is not
        # dev-only; only a bare 'dev' flag means dev-exclusive.
        installed.append(
            InstalledPackage(
                name=name,
                version=version_text,
                path=key,
                dev=bool(entry.get("dev", False)),
                optional=bool(entry.get("optional", False)),
            )
        )

    return installed
