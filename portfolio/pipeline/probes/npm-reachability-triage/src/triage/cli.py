"""Command-line entry point, and the GitHub Action's implementation.

Usage::

    python3 -m triage.cli --project . --output-dir ./evidence

Exit codes are chosen so the tool is usable as a CI gate without forcing that
choice on anyone: ``--fail-on`` is opt-in and defaults to never failing, because
a scanner that breaks the build by default gets disabled, and a disabled scanner
records nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import advisories as advisories_mod
from . import deployment as deployment_mod
from . import discovery as discovery_mod
from . import graph as graph_mod
from . import sources as sources_mod
from .engine import SHIPPED, ProjectContext, triage
from .evidence import (
    ACCURACY_NOTE,
    COVERAGE_LIMITS,
    NOT_AN_ATTESTATION,
    Report,
    _render_table,
    coverage_to_dict,
    render_repository_coverage,
    to_json,
    to_markdown,
)
from .lockfile import UnsupportedLockfile, parse_lockfile

SEVERITY_ORDER = {"low": 0, "moderate": 1, "medium": 1, "high": 2, "critical": 3}


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="npm-reachability-triage",
        description=(
            "Report which npm advisory findings describe code your project "
            "actually deploys."
        ),
    )
    parser.add_argument(
        "--project", default=".", help="project directory (default: current)"
    )
    parser.add_argument(
        "--repository",
        default=None,
        help=(
            "scan every npm project under this directory instead of one "
            "project, and report which ones could not be analysed. Use this on "
            "a monorepo: a single-project record says nothing about the rest of "
            "the repository it came from."
        ),
    )
    parser.add_argument(
        "--lockfile",
        default=None,
        help="path to package-lock.json (default: <project>/package-lock.json)",
    )
    parser.add_argument(
        "--output-dir", default=None, help="write record.json and record.md here"
    )
    parser.add_argument(
        "--advisories",
        default=None,
        help=(
            "path to a local advisory file: an OSV bulk .zip, an OSV JSON "
            "array, or an npm bulk response. Omit to fetch the OSV npm feed."
        ),
    )
    parser.add_argument(
        "--fail-on",
        choices=["never", "low", "moderate", "high", "critical"],
        default="never",
        help="exit non-zero when a deployed finding reaches this severity",
    )
    parser.add_argument(
        "--deployment-mode",
        choices=[deployment_mod.STATIC_EXPORT, deployment_mod.SERVER, deployment_mod.UNKNOWN],
        default=None,
        help="override deployment detection when your build is not a plain Next.js config",
    )
    parser.add_argument(
        "--no-source-scan",
        action="store_true",
        help=(
            "skip reading the project's own source for imports. This makes the "
            "tool LESS conservative: the scan exists to block build-surface "
            "suppressions for packages the project uses itself, so skipping it "
            "can suppress a finding that should have been reported."
        ),
    )
    return parser


def _load_local_advisories(path: Path, packages: set[str]):
    """Load advisories from a local file, accepting any supported shape.

    A ``.zip`` is treated as an OSV bulk archive, which makes the tool usable
    against a pre-downloaded feed on a runner with no egress.
    """
    if path.suffix == ".zip":
        return advisories_mod.load_osv_zip(path.read_bytes(), packages)

    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return advisories_mod.load_osv_records(payload)
    if isinstance(payload, dict):
        return advisories_mod.advisories_from_npm_bulk(payload)
    raise ValueError(f"unrecognised advisory file shape in {path}")


def _profile_for(project: Path, override: str | None):
    if override:
        return deployment_mod.DeploymentProfile(
            override,
            "high",
            (f"deployment mode set explicitly to `{override}`",),
            None,
        )
    return deployment_mod.detect(project)


def _report_for_project(
    project: Path,
    lockfile_path: Path,
    args,
    advisory_list,
    feed: str,
    display_name: str,
) -> Report:
    """Triage one project against an already-loaded advisory list."""
    installed = parse_lockfile(lockfile_path)
    names = {package.name for package in installed}
    relevant = [a for a in advisory_list if a.packages & names]

    context = ProjectContext(
        dependency_graph=graph_mod.build_from_lockfile(lockfile_path),
        declared_dependencies=sources_mod.declared_production_dependencies(project),
        source_imports=frozenset()
        if args.no_source_scan
        else sources_mod.scan_project_imports(project),
    )
    profile = _profile_for(project, args.deployment_mode)
    findings = triage(installed, relevant, profile, context)
    return Report(
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        project=display_name,
        feed=feed,
        component_count=len(installed),
        profile=profile,
        findings=tuple(findings),
    )


def run_repository(args) -> int:
    """Scan every npm project under ``args.repository``.

    The coverage walk runs first and is rendered first, because the number a
    reader needs before any finding count is how much of their repository this
    record is about.
    """
    root = Path(args.repository)
    if not root.is_dir():
        print(f"error: no directory at {root}", file=sys.stderr)
        return 2

    coverage = discovery_mod.discover(root)

    # Resolve every analysable project's lockfile first, so the advisory feed is
    # fetched once for the union of package names rather than once per project.
    projects: list[tuple[discovery_mod.DiscoveredProject, Path, Path]] = []
    all_names: set[str] = set()
    for entry in coverage.analysed:
        # A workspace member resolves through its root's lockfile, so triaging it
        # separately would re-report the entire workspace's components once per
        # member. The root's own run already covers it; the coverage table says
        # so by name.
        if entry.covered_by is not None:
            continue
        project_dir = root if entry.path == "." else root / entry.path
        lockfile_path = root / entry.lockfile if entry.lockfile else None
        if lockfile_path is None or not lockfile_path.is_file():
            continue
        try:
            all_names |= {p.name for p in parse_lockfile(lockfile_path)}
        except (UnsupportedLockfile, ValueError, OSError):
            continue
        projects.append((entry, project_dir, lockfile_path))

    if args.advisories:
        feed = str(args.advisories)
        advisory_list = _load_local_advisories(Path(args.advisories), all_names)
    else:
        feed = advisories_mod.OSV_NPM_BULK_URL
        advisory_list = advisories_mod.fetch_osv_bulk(all_names)
    advisory_list = [a for a in advisory_list if a.packages & all_names]

    reports: list[Report] = []
    for entry, project_dir, lockfile_path in projects:
        reports.append(
            _report_for_project(
                project_dir, lockfile_path, args, advisory_list, feed, entry.path
            )
        )

    markdown = to_repository_markdown(root.resolve().name, coverage, reports, feed)
    if args.output_dir:
        output = Path(args.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        (output / "record.json").write_text(
            to_repository_json(root.resolve().name, coverage, reports, feed),
            encoding="utf-8",
        )
        (output / "record.md").write_text(markdown, encoding="utf-8")
    print(markdown)

    if args.fail_on != "never":
        threshold = SEVERITY_ORDER[args.fail_on]
        for report in reports:
            for finding in report.findings:
                if finding.verdict != SHIPPED:
                    continue
                level = SEVERITY_ORDER.get((finding.severity or "").lower())
                if level is not None and level >= threshold:
                    return 1
    return 0


def to_repository_markdown(name, coverage, reports, feed) -> str:
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    shipped = sum(len(report.shipped) for report in reports)
    suppressed = sum(len(report.suppressed) for report in reports)
    lines = [
        f"# Dependency reachability record — {name}",
        "",
        f"*Generated {generated} · feed: {feed}*",
        "",
        f"> {NOT_AN_ATTESTATION}",
        "",
        f"**{shipped} findings describe deployed code** across "
        f"{len(reports)} analysed projects; {suppressed} were suppressed.",
        "",
    ]
    lines.extend(render_repository_coverage(coverage))

    for report in reports:
        lines.append(f"## `{report.project}`")
        lines.append("")
        counts = report.counts()
        lines.append(
            f"{report.component_count} components · deployment mode "
            f"**{report.profile.mode}** ({report.profile.confidence} confidence) · "
            f"{counts[SHIPPED]} deployed, {len(report.suppressed)} suppressed"
        )
        lines.append("")
        if report.shipped:
            lines.extend(_render_table(report.shipped, show_reason=False))
        else:
            lines.append("No advisory matched a package on a deployed path.")
        lines.append("")
        if report.suppressed:
            lines.append("<details><summary>Suppressed findings</summary>")
            lines.append("")
            lines.extend(_render_table(report.suppressed, show_reason=True))
            lines.append("")
            lines.append("</details>")
            lines.append("")

    lines.append("## What this record does not cover")
    lines.append("")
    lines.extend(f"- {limit}" for limit in COVERAGE_LIMITS)
    lines.append("")
    lines.append(ACCURACY_NOTE)
    lines.append("")
    return "\n".join(lines)


def to_repository_json(name, coverage, reports, feed) -> str:
    payload = {
        "schema": "npm-reachability-triage/repository/v1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repository": name,
        "advisory_feed": feed,
        "not_an_attestation": NOT_AN_ATTESTATION,
        "coverage": coverage_to_dict(coverage),
        "coverage_limits": list(COVERAGE_LIMITS),
        "projects": [json.loads(to_json(report)) for report in reports],
    }
    return json.dumps(payload, indent=2, sort_keys=False)


def run(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.repository:
        return run_repository(args)
    project = Path(args.project)
    lockfile_path = Path(args.lockfile) if args.lockfile else project / "package-lock.json"

    if not lockfile_path.is_file():
        print(f"error: no lockfile at {lockfile_path}", file=sys.stderr)
        return 2

    try:
        installed = parse_lockfile(lockfile_path)
    except UnsupportedLockfile as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.deployment_mode:
        profile = deployment_mod.DeploymentProfile(
            args.deployment_mode,
            "high",
            (f"deployment mode set explicitly to `{args.deployment_mode}`",),
            None,
        )
    else:
        profile = deployment_mod.detect(project)

    names = {package.name for package in installed}
    if args.advisories:
        feed = str(args.advisories)
        advisory_list = _load_local_advisories(Path(args.advisories), names)
        advisory_list = [a for a in advisory_list if a.packages & names]
    else:
        feed = advisories_mod.OSV_NPM_BULK_URL
        advisory_list = advisories_mod.fetch_osv_bulk(names)

    context = ProjectContext(
        dependency_graph=graph_mod.build_from_lockfile(lockfile_path),
        declared_dependencies=sources_mod.declared_production_dependencies(project),
        source_imports=frozenset()
        if args.no_source_scan
        else sources_mod.scan_project_imports(project),
    )

    findings = triage(installed, advisory_list, profile, context)

    report = Report(
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        project=str(project.resolve().name),
        feed=feed,
        component_count=len(installed),
        profile=profile,
        findings=tuple(findings),
    )

    markdown = to_markdown(report)
    if args.output_dir:
        output = Path(args.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        (output / "record.json").write_text(to_json(report), encoding="utf-8")
        (output / "record.md").write_text(markdown, encoding="utf-8")
    print(markdown)

    if args.fail_on != "never":
        threshold = SEVERITY_ORDER[args.fail_on]
        for finding in findings:
            if finding.verdict != SHIPPED:
                continue
            level = SEVERITY_ORDER.get((finding.severity or "").lower())
            if level is not None and level >= threshold:
                return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run())
