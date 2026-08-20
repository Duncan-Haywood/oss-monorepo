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
from .engine import SHIPPED, triage
from .evidence import Report, to_json, to_markdown
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


def run(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
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

    findings = triage(installed, advisory_list, profile)

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
