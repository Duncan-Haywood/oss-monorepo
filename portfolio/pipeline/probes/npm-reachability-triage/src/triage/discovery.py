"""Find every npm project in a repository, and say which ones this tool cannot read.

Everything else in this package answers "what did we find in *this* project".
This module answers the question a reader of a record actually has, which is
"did you look at all of my code" — and the honest answer for a repository with
more than one npm project has, until now, been no.

The failure this exists to close is one level up from the one
:mod:`triage.evidence` already guards. That module lists every *suppressed*
finding on the reasoning that "suppression a user cannot audit is
indistinguishable from a missed finding". A project the tool was never pointed
at is worse than a suppressed finding: it produces no record at all, so a clean
record and an unexamined directory are the same artifact from outside. The CLI
took a single ``--project`` path and a repository with six other npm manifests
in it looked exactly like a repository with none.

``COVERAGE_LIMITS`` did carry a line about this, and it is the reason the gap
survived five passes over this probe: it says *"other ecosystems in the same
repository are not covered"*. That sentence is true and it is not the problem.
A reader who has no Python in their repository reads it, correctly concludes it
does not apply to them, and is left believing their npm code was covered. The
limit was written about pip and Go; what it needed to say is that other **npm**
projects in the same repository are not covered either.

So the unit here is the repository, and the output names every manifest found,
whether it was analysed, and — when it was not — which specific thing stopped
it. A refusal a user can read is a refusal they can act on: `pnpm-lockfile`
tells them to run `npm install --package-lock-only`, where silence tells them
nothing.

Two decisions worth stating, because both could reasonably have gone the other
way:

* **A workspace member with no lockfile of its own is covered, not refused**,
  when an ancestor's analysable lockfile actually declares it. npm workspaces
  put one ``package-lock.json`` at the root and resolve every member through
  it, so calling the members "unanalysed" would be false in the common case.
  The check is that the ancestor lockfile's ``packages`` map holds the member's
  relative path as a key — the same workspace entries
  :func:`triage.lockfile._name_from_path` returns ``None`` for. It is not
  inferred from the root manifest's ``workspaces`` glob, which states an
  intention rather than a resolved fact.

* **An analysable project whose deployment mode is undetermined is reported as
  a distinct, weaker state** rather than folded into "analysed". The findings
  are real, but no surface suppression can fire, so the reachability claim this
  tool sells is not being made for that project. That is a materially different
  thing to hand a customer and it is not visible from the finding counts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import deployment as deployment_mod
from .lockfile import UnsupportedLockfile, parse_lockfile_data

#: Directories never descended into. ``node_modules`` is the one that matters —
#: it holds thousands of manifests belonging to dependencies rather than to the
#: customer, and reporting them as uncovered projects would bury the real ones.
SKIP_DIRECTORIES = frozenset(
    {
        "node_modules",
        ".git",
        ".next",
        ".nuxt",
        ".svelte-kit",
        ".venv",
        "venv",
        "__pycache__",
        "dist",
        "build",
        "out",
        "coverage",
        ".turbo",
        ".cache",
    }
)

#: Analysed, and the full reachability claim applies.
ANALYSED = "analysed"
#: Analysed, but deployment mode is undetermined, so nothing can be suppressed
#: on the grounds that its surface is not deployed.
ANALYSED_NO_DEPLOYMENT_MODE = "analysed-no-deployment-mode"
#: Not analysed. ``reason`` names what stopped it.
REFUSED = "refused"

#: Every reason a manifest can go unanalysed, mapped to what the reader can do
#: about it. Held as data so the record can render the remedy next to the
#: refusal instead of leaving "unsupported" as the whole message.
REFUSAL_REMEDIES: dict[str, str] = {
    "no-lockfile": (
        "no lockfile found for this manifest or any ancestor; run `npm install` "
        "to generate one"
    ),
    "pnpm-lockfile": (
        "resolved by a pnpm lockfile, which this tool cannot read; run "
        "`npm install --package-lock-only` to emit a package-lock.json, or use "
        "a pnpm-native scanner"
    ),
    "yarn-lockfile": (
        "resolved by a yarn lockfile, which this tool cannot read; run "
        "`npm install --package-lock-only` to emit a package-lock.json, or use "
        "a yarn-native scanner"
    ),
    "lockfile-v1": (
        "package-lock.json is lockfileVersion 1, which carries no "
        "per-install-location dev flag; upgrade npm and re-run `npm install` to "
        "regenerate it at v2 or later"
    ),
    "unreadable-lockfile": (
        "package-lock.json could not be parsed; check it is valid JSON and not "
        "a merge conflict left unresolved"
    ),
    "unreadable-manifest": (
        "package.json could not be parsed; check it is valid JSON"
    ),
    "not-in-workspace-lockfile": (
        "an ancestor package-lock.json exists but does not declare this "
        "directory as a workspace, so its dependencies are not resolved "
        "anywhere this tool can read; run `npm install` here, or add it to the "
        "root workspaces list"
    ),
}


@dataclass(frozen=True)
class DiscoveredProject:
    """One ``package.json`` found in the repository, and its coverage status."""

    #: Path to the directory holding the manifest, relative to the repository root.
    path: str
    status: str
    #: For :data:`REFUSED`, the reason code. ``None`` otherwise.
    reason: str | None = None
    #: The lockfile this project resolves through, relative to the root.
    lockfile: str | None = None
    #: Set when this project is resolved by an ancestor's workspace lockfile.
    covered_by: str | None = None

    @property
    def analysed(self) -> bool:
        return self.status in (ANALYSED, ANALYSED_NO_DEPLOYMENT_MODE)

    @property
    def remedy(self) -> str | None:
        return REFUSAL_REMEDIES.get(self.reason) if self.reason else None


@dataclass(frozen=True)
class RepositoryCoverage:
    """Every npm manifest in a repository, analysed or not."""

    root: str
    projects: tuple[DiscoveredProject, ...]

    @property
    def analysed(self) -> tuple[DiscoveredProject, ...]:
        return tuple(p for p in self.projects if p.analysed)

    @property
    def refused(self) -> tuple[DiscoveredProject, ...]:
        return tuple(p for p in self.projects if not p.analysed)

    def counts(self) -> dict[str, int]:
        return {
            "manifests_found": len(self.projects),
            "analysed": len(self.analysed),
            "refused": len(self.refused),
        }

    def refusals_by_reason(self) -> dict[str, int]:
        tally: dict[str, int] = {}
        for project in self.refused:
            key = project.reason or "unknown"
            tally[key] = tally.get(key, 0) + 1
        return dict(sorted(tally.items()))


def _relative(path: Path, root: Path) -> str:
    """Repository-relative POSIX path, with the root itself rendered as ``.``."""
    try:
        relative = path.relative_to(root)
    except ValueError:  # pragma: no cover - callers always pass a descendant
        return path.as_posix()
    text = relative.as_posix()
    return text or "."


def iter_manifests(root: str | Path):
    """Yield every non-vendored ``package.json`` directory under ``root``.

    Sorted, so a record's project order does not depend on filesystem order and
    two runs over the same tree produce a diffable artifact.
    """
    root_path = Path(root)
    found: list[Path] = []
    stack = [root_path]
    while stack:
        current = stack.pop()
        try:
            entries = list(current.iterdir())
        except (PermissionError, OSError):
            continue
        for entry in entries:
            if entry.is_symlink():
                # A symlinked directory can point outside the repository or back
                # into it; either way its target is reported under its real path
                # or not at all, rather than a second time under this name.
                continue
            if entry.is_dir():
                if entry.name not in SKIP_DIRECTORIES:
                    stack.append(entry)
            elif entry.name == "package.json":
                found.append(current)
    return sorted(found, key=lambda p: _relative(p, root_path))


def _read_lockfile_status(path: Path) -> tuple[bool, str | None, dict | None]:
    """Return ``(analysable, reason, raw)`` for a ``package-lock.json``."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False, "unreadable-lockfile", None
    if not isinstance(raw, dict):
        return False, "unreadable-lockfile", None
    try:
        parse_lockfile_data(raw)
    except UnsupportedLockfile:
        version = raw.get("lockfileVersion")
        reason = "lockfile-v1" if version == 1 else "unreadable-lockfile"
        return False, reason, raw
    return True, None, raw


def _workspace_keys(raw: dict) -> set[str]:
    """Workspace member paths a v2/v3 lockfile resolves.

    These are the ``packages`` keys with no ``node_modules`` segment — the
    entries :mod:`triage.lockfile` skips because they are not third-party
    components. Here they are exactly the signal needed: a key like
    ``apps/web`` means this lockfile resolves that directory's dependencies.
    """
    packages = raw.get("packages")
    if not isinstance(packages, dict):
        return set()
    return {
        key
        for key in packages
        if key and "node_modules/" not in key and not key.startswith("node_modules")
    }


def _classify(
    project_dir: Path, root: Path, detect_deployment: bool
) -> DiscoveredProject:
    relative = _relative(project_dir, root)

    try:
        json.loads((project_dir / "package.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return DiscoveredProject(relative, REFUSED, "unreadable-manifest")

    own_lock = project_dir / "package-lock.json"
    if own_lock.is_file():
        analysable, reason, _ = _read_lockfile_status(own_lock)
        if not analysable:
            return DiscoveredProject(
                relative, REFUSED, reason, lockfile=_relative(own_lock, root)
            )
        return _analysed(
            project_dir, root, relative, _relative(own_lock, root), None, detect_deployment
        )

    # No package-lock.json here. Walk outward from this directory looking for the
    # lockfile that resolves it. The walk starts at the project itself, because a
    # pnpm or yarn workspace *root* holds its own non-npm lockfile and would
    # otherwise be reported as having no lockfile at all — which is the wrong
    # remedy to hand someone whose repository is fully locked, just not by npm.
    # The nearest holder of *any* lockfile wins: a further-out lockfile does not
    # resolve past an intervening workspace.
    for ancestor in (project_dir, *project_dir.parents):
        if not _is_within(ancestor, root):
            break

        pnpm = ancestor / "pnpm-lock.yaml"
        if pnpm.is_file():
            return DiscoveredProject(
                relative, REFUSED, "pnpm-lockfile", lockfile=_relative(pnpm, root)
            )

        for yarn_name in ("yarn.lock",):
            yarn = ancestor / yarn_name
            if yarn.is_file():
                return DiscoveredProject(
                    relative, REFUSED, "yarn-lockfile", lockfile=_relative(yarn, root)
                )

        ancestor_lock = ancestor / "package-lock.json"
        if ancestor_lock.is_file():
            analysable, reason, raw = _read_lockfile_status(ancestor_lock)
            lock_relative = _relative(ancestor_lock, root)
            if not analysable:
                return DiscoveredProject(relative, REFUSED, reason, lockfile=lock_relative)
            member = project_dir.relative_to(ancestor).as_posix()
            if raw is not None and member in _workspace_keys(raw):
                return _analysed(
                    project_dir,
                    root,
                    relative,
                    lock_relative,
                    _relative(ancestor, root),
                    detect_deployment,
                )
            return DiscoveredProject(
                relative, REFUSED, "not-in-workspace-lockfile", lockfile=lock_relative
            )

        if ancestor == root:
            break

    return DiscoveredProject(relative, REFUSED, "no-lockfile")


def _analysed(
    project_dir: Path,
    root: Path,
    relative: str,
    lockfile: str,
    covered_by: str | None,
    detect_deployment: bool,
) -> DiscoveredProject:
    status = ANALYSED
    if detect_deployment:
        profile = deployment_mod.detect(project_dir)
        if profile.mode == deployment_mod.UNKNOWN:
            status = ANALYSED_NO_DEPLOYMENT_MODE
    return DiscoveredProject(
        relative, status, None, lockfile=lockfile, covered_by=covered_by
    )


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def discover(root: str | Path, detect_deployment: bool = True) -> RepositoryCoverage:
    """Classify every npm project under ``root``.

    ``detect_deployment`` exists so the walk can be run without reading each
    project's ``next.config.*``; the coverage answer does not depend on it, only
    the split between :data:`ANALYSED` and
    :data:`ANALYSED_NO_DEPLOYMENT_MODE` does.
    """
    root_path = Path(root)
    projects = tuple(
        _classify(directory, root_path, detect_deployment)
        for directory in iter_manifests(root_path)
    )
    return RepositoryCoverage(root=str(root_path), projects=projects)
