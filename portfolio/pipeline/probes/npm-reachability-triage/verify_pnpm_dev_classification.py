#!/usr/bin/env python3
"""Independently re-derive every pnpm package's dev/production classification
and diff it against ``triage.pnpm``'s own answer.

``triage/pnpm.py`` (see its module docstring) computes dev-ness by graph
traversal rather than reading a stored flag, which is a kind of claim this
probe's README names as unreviewed: "this module's precision has not been
checked against a hand-labelled advisory set; treat its output as
structurally sound ... rather than accuracy-validated," and the accuracy
note in ``triage/evidence.py`` says the hand-verified sample "stayed at 7"
npm products while readable projects went 9 -> 16 when pnpm support landed.

This is the pnpm counterpart to ``verify_suppressions.py``'s structural
check, generalised beyond the two findings this portfolio's one pnpm venture
happens to have today: rather than re-checking only the packages the triage
engine flagged, it re-derives production reachability for *every* installed
package in *every* pnpm importer, from a traversal written independently of
``triage.pnpm._traverse``. A bug shared between the module and this script
would have to be the same bug written twice.

What "independent" means here: this script re-reads the raw YAML with
``yaml.safe_load`` and walks ``dependencies``/``optionalDependencies`` edges
itself. It does not call ``triage.pnpm.analyse`` or ``_traverse``. It applies
the same *policy* the module's docstring states (an edge this walk cannot
follow forces every install of the package it named onto the production
graph, so a gap in either implementation can only ever widen what counts as
"production" and never narrow it) because that policy is the specification
being checked, not an implementation detail of the code under test.

Usage::

    python3 verify_pnpm_dev_classification.py [repo-root]
"""

from __future__ import annotations

import json
import posixpath
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent / "src"))

from triage.discovery import discover  # noqa: E402
from triage.pnpm import load  # noqa: E402

#: Deliberately re-stated rather than imported from ``triage.pnpm``: these
#: name the *specification* being checked (which manifest fields count as
#: "production"), not an implementation detail of the module under test.
_PRODUCTION_FIELDS = ("dependencies", "optionalDependencies")
_LINK_PREFIX = "link:"


def _load_raw(lockfile: Path) -> dict:
    raw = yaml.safe_load(lockfile.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"{lockfile}: pnpm lockfile is not a mapping")
    return raw


def _resolve_link(importer_path: str, version: str) -> str:
    target = version[len(_LINK_PREFIX):]
    joined = posixpath.normpath(posixpath.join(importer_path, target))
    return "." if joined in ("", ".") else joined


def _entries(node: object, fields: tuple[str, ...], from_importer: bool) -> dict[str, str]:
    """Every ``name -> version`` pair a node declares under ``fields``.

    An importer's fields hold ``{specifier, version}`` objects; a snapshot's
    hold the version string directly.
    """
    if not isinstance(node, dict):
        return {}
    out: dict[str, str] = {}
    for field in fields:
        declared = node.get(field)
        if not isinstance(declared, dict):
            continue
        for name, value in declared.items():
            if not isinstance(name, str):
                continue
            if from_importer:
                if isinstance(value, dict) and isinstance(value.get("version"), str):
                    out[name] = value["version"]
            elif isinstance(value, str):
                out[name] = value
    return out


def independent_production_reachability(
    raw: dict, importer_path: str
) -> tuple[set[str], set[str]]:
    """Return ``(reachable_snapshot_keys, unresolved_package_names)`` for one
    importer, walking only ``dependencies``/``optionalDependencies`` edges.

    Mirrors the *policy* ``triage.pnpm`` documents (an edge this walk cannot
    follow forces every install of the package it named onto the production
    graph) without calling any of that module's traversal code.
    """
    importers = raw.get("importers", {})
    snapshots = raw.get("snapshots", {})

    visited: set[str] = set()
    reached: set[str] = set()
    unresolved: set[str] = set()

    roots = _entries(importers.get(importer_path), _PRODUCTION_FIELDS, True)
    stack: list[tuple[str, str, str]] = [
        (name, version, importer_path) for name, version in roots.items()
    ]

    while stack:
        name, version, from_importer = stack.pop()
        if version.startswith(_LINK_PREFIX):
            target = _resolve_link(from_importer, version)
            marker = f"importer:{target}"
            if target not in importers:
                unresolved.add(name)
                continue
            if marker in visited:
                continue
            visited.add(marker)
            for name2, version2 in _entries(
                importers.get(target), _PRODUCTION_FIELDS, True
            ).items():
                stack.append((name2, version2, target))
            continue

        key = f"{name}@{version}"
        marker = f"snapshot:{key}"
        if key not in snapshots:
            unresolved.add(name)
            # Still emitted below; nothing behind it can be walked.
        if marker in visited:
            continue
        visited.add(marker)
        reached.add(key)
        for name2, version2 in _entries(
            snapshots.get(key), _PRODUCTION_FIELDS, False
        ).items():
            stack.append((name2, version2, importer_path))

    return reached, unresolved


def _base_key(snapshot_key: str) -> str:
    index = snapshot_key.find("(")
    return snapshot_key if index == -1 else snapshot_key[:index]


def check_project(root: Path, lockfile: Path, importer_path: str) -> list[dict]:
    raw = _load_raw(lockfile)
    reached, unresolved = independent_production_reachability(raw, importer_path)

    # An unresolved production-side edge forces every install of the package it
    # named onto the production graph -- the same fail-towards-reporting policy
    # triage.pnpm documents, applied here independently.
    if unresolved:
        all_keys = set(raw.get("snapshots", {}).keys())
        for key in all_keys:
            base_name = _base_key(key).rsplit("@", 1)
            if base_name and base_name[0] in unresolved:
                reached.add(key)

    resolved = load(lockfile, importer_path=importer_path)

    problems = []
    for package in resolved.installed:
        expect_production = package.path in reached
        actual_production = not package.dev
        if expect_production != actual_production:
            problems.append(
                {
                    "importer": importer_path,
                    "package": package.name,
                    "version": package.version,
                    "location": package.path,
                    "triage_pnpm_says_dev": package.dev,
                    "independent_walk_says_production_reachable": expect_production,
                }
            )
    return problems


def main() -> int:
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parents[4]
    coverage = discover(repo_root, detect_deployment=False)

    checked = 0
    all_problems: list[dict] = []
    for project in coverage.analysed:
        if project.pnpm_importer is None:
            continue
        lockfile = repo_root / project.lockfile
        problems = check_project(repo_root, lockfile, project.pnpm_importer)
        for problem in problems:
            problem["project"] = project.path
        all_problems.extend(problems)
        checked += 1

    report = {
        "pnpm_importers_checked": checked,
        "mismatches": all_problems,
    }
    print(json.dumps(report, indent=2))
    Path("verify-pnpm-dev-classification-2026-08-23.json").write_text(
        json.dumps(report, indent=2)
    )
    return 1 if all_problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
