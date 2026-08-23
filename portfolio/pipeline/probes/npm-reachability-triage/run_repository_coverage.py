"""Measure how much of a repository this tool can actually read.

``run_portfolio_sample.py`` runs the triage over a hand-written list of seven
product directories. That list is the thing this script exists to stop
depending on: it was assembled by someone who already knew where the projects
were, so it cannot answer the question a customer has, which is whether
anything was missed.

This walks the repository instead, classifies every ``package.json`` it finds,
and writes the coverage table alongside the per-project finding counts. The
counts are here only as a cross-check that the walk reaches the same projects
the hand-written list did — the findings themselves live in
``validation-2026-08-21-build-surface.json``.

Usage::

    python3 run_repository_coverage.py <osv.zip> [--root .] [--output FILE]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from triage import advisories as advisories_mod  # noqa: E402
from triage import deployment as deployment_mod  # noqa: E402
from triage import discovery as discovery_mod  # noqa: E402
from triage import pnpm as pnpm_mod  # noqa: E402
from triage import sources as sources_mod  # noqa: E402
from triage.cli import dependency_graph_for, parse_project_lockfile  # noqa: E402
from triage.engine import DEV_ONLY, NOT_DEPLOYED, SHIPPED, ProjectContext, triage  # noqa: E402
from triage.evidence import coverage_to_dict  # noqa: E402
from triage.lockfile import UnsupportedLockfile  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("advisories", help="path to an OSV npm bulk .zip")
    parser.add_argument("--root", default=".", help="repository root to walk")
    parser.add_argument(
        "--output", default=None, help="write the JSON record here as well as stdout"
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    coverage = discovery_mod.discover(root)

    resolved = []
    names: set[str] = set()
    for entry in coverage.analysed:
        # A workspace member resolves through its root's lockfile, so triaging
        # it separately would re-report the whole workspace once per member —
        # the same skip `cli.py`'s `run_repository` applies, for the same
        # reason. A pnpm importer is never `covered_by` anything (each keeps
        # its own dependency list in the lockfile), so it always reaches here.
        if entry.covered_by is not None:
            continue
        project_dir = root if entry.path == "." else root / entry.path
        lockfile_path = root / entry.lockfile
        try:
            installed = parse_project_lockfile(lockfile_path, entry.pnpm_importer)
        except (UnsupportedLockfile, pnpm_mod.UnsupportedPnpmLockfile, ValueError, OSError):
            continue
        names |= {package.name for package in installed}
        resolved.append((entry, project_dir, lockfile_path, installed))

    advisory_list = advisories_mod.load_osv_zip(
        Path(args.advisories).read_bytes(), names
    )

    projects = []
    for entry, project_dir, lockfile_path, installed in resolved:
        installed_names = {package.name for package in installed}
        relevant = [a for a in advisory_list if a.packages & installed_names]
        profile = deployment_mod.detect(project_dir)
        context = ProjectContext(
            dependency_graph=dependency_graph_for(lockfile_path, entry.pnpm_importer),
            declared_dependencies=sources_mod.declared_production_dependencies(project_dir),
            source_imports=sources_mod.scan_project_imports(project_dir),
        )
        findings = triage(installed, relevant, profile, context)
        projects.append(
            {
                "project": entry.path,
                "status": entry.status,
                "mode": profile.mode,
                "confidence": profile.confidence,
                "components": len(installed),
                "findings": len(findings),
                "deployed": sum(1 for f in findings if f.verdict == SHIPPED),
                "suppressed": sum(1 for f in findings if f.suppressed),
                "dev_only": sum(1 for f in findings if f.verdict == DEV_ONLY),
                "not_deployed": sum(1 for f in findings if f.verdict == NOT_DEPLOYED),
            }
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feed": Path(args.advisories).name,
        "coverage": coverage_to_dict(coverage),
        "projects": projects,
        "totals": {
            "deployed": sum(p["deployed"] for p in projects),
            "suppressed": sum(p["suppressed"] for p in projects),
            "findings": sum(p["findings"] for p in projects),
        },
    }
    text = json.dumps(payload, indent=2)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
