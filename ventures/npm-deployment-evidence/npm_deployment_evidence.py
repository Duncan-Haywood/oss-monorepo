"""Produce local, deterministic evidence about npm production reachability."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path


LIMITATIONS = [
    "This report reads package-lock.json v2/v3 only; it does not inspect yarn or pnpm projects.",
    "A package is marked build-only only when every installed location is reached through a known build dependency.",
    "Source scanning is conservative text matching and cannot prove dynamic imports or runtime loading absent.",
    "Build-only means absent from the deployed application artifact, not safe on the machine that runs the build.",
    "This is evidence, not a vulnerability determination, attestation, or compliance advice.",
]


def _package_name(path: str) -> str | None:
    marker = "node_modules/"
    if marker not in path:
        return None
    return path.rsplit(marker, 1)[1] or None


def _unsupported_lockfile_error(text: str, file_name: str | None = None) -> str | None:
    """Name yarn/pnpm lockfiles instead of letting JSON.parse call them 'not valid JSON'."""
    name = Path(file_name or "").name.lower()
    head = (text or "")[:400]
    looks_yarn = name == "yarn.lock" or head.lstrip().lower().startswith("# yarn") or "yarn lockfile v" in head.lower()
    looks_pnpm = (
        name in {"pnpm-lock.yaml", "pnpm-lock.yml"}
        or ("lockfileVersion:" in head and "importers:" in head)
    )
    if looks_yarn:
        return (
            "This file is a yarn.lock. This tool only reads package-lock.json v2 or v3 "
            "(npm 7+). Generate one with `npm install`, or keep using yarn's own audit tools."
        )
    if looks_pnpm:
        return (
            "This file is a pnpm-lock.yaml. This tool only reads package-lock.json v2 or v3 "
            "(npm 7+). Generate one with `npm install`, or keep using pnpm's own audit tools."
        )
    return None


def load_lockfile(path: Path) -> tuple[dict, dict[str, list[dict]]]:
    text = path.read_text(encoding="utf-8")
    unsupported = _unsupported_lockfile_error(text, path.name)
    if unsupported:
        raise ValueError(unsupported)
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            "That file is not valid JSON. Pass package-lock.json itself, not a different file."
        ) from exc
    if raw.get("lockfileVersion") not in (2, 3) or not isinstance(raw.get("packages"), dict):
        raise ValueError(
            "package-lock.json v2 or v3 with a packages map is required "
            "(yarn.lock and pnpm-lock.yaml are not supported)"
        )
    packages: dict[str, list[dict]] = {}
    for location, entry in raw["packages"].items():
        if not isinstance(entry, dict) or not entry.get("version"):
            continue
        name = _package_name(location)
        if name:
            packages.setdefault(name, []).append({"path": location, **entry})
    return raw, packages


def _declared(root: dict) -> set[str]:
    return set((root.get("dependencies") or {}).keys())


def _is_build_only(name: str, locations: list[dict], root: dict) -> tuple[bool, str]:
    if name in _declared(root):
        return False, "declared by the application; direct production use is possible"
    if any(not location.get("dev", False) for location in locations):
        return False, "at least one install location is on a production path"
    return True, "every install location is marked dev-only by npm"


def build_report(lockfile: Path) -> dict:
    root, packages = load_lockfile(lockfile)
    rows = []
    for name in sorted(packages):
        locations = packages[name]
        build_only, reason = _is_build_only(name, locations, root["packages"].get("", {}))
        rows.append({
            "name": name,
            "versions": sorted({item["version"] for item in locations}),
            "locations": [item["path"] for item in locations],
            "surface": "build-only" if build_only else "production",
            "reason": reason,
        })
    counts = Counter(row["surface"] for row in rows)
    return {
        "generated_on": date.today().isoformat(),
        "lockfile": lockfile.name,
        "component_count": len(rows),
        "counts": dict(counts),
        "components": rows,
        "limitations": LIMITATIONS,
    }


def markdown(report: dict) -> str:
    lines = [
        "# npm deployment evidence",
        "",
        f"Checked `{report['lockfile']}` on {report['generated_on']}: **{report['component_count']} components**.",
        "",
        "This report shows package-lockfile evidence about dependency reachability. It does not claim that a project is secure or compliant.",
        "",
        "## Summary",
        "",
        f"- Production-path components: **{report['counts'].get('production', 0)}**",
        f"- Build-only components: **{report['counts'].get('build-only', 0)}**",
        "",
        "## Components",
        "",
        "| Package | Version(s) | Surface | Evidence |",
        "|---|---|---|---|",
    ]
    for row in report["components"]:
        lines.append(f"| `{row['name']}` | {', '.join(row['versions'])} | {row['surface']} | {row['reason']} |")
    lines += ["", "## Limitations", ""]
    lines.extend(f"- {limitation}" for limitation in report["limitations"])
    lines += [
        "",
        "**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.",
    ]
    return "\n".join(lines) + "\n"


def record_usage(path: Path | None) -> None:
    if path is None:
        return
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    current["report_generated"] = int(current.get("report_generated", 0)) + 1
    path.write_text(json.dumps(current, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Show which npm dependencies reach production paths.",
        epilog=(
            "No warranty. This is lockfile evidence, not a security verdict, "
            "attestation, or compliance advice. You are responsible for "
            "reviewing the output. Best-effort; no SLA. Optional GitHub Sponsors "
            "never changes what the tool does."
        ),
    )
    parser.add_argument("lockfile", type=Path, help="path to package-lock.json v2 or v3")
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--output", type=Path, help="write the report to a file")
    parser.add_argument("--usage-file", type=Path, help="optional local aggregate counter; no project data is recorded")
    parser.add_argument("--no-usage", action="store_true", help="disable local usage counting")
    args = parser.parse_args(argv)
    try:
        report = build_report(args.lockfile)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    record_usage(None if args.no_usage else args.usage_file)
    output = json.dumps(report, indent=2, sort_keys=True) + "\n" if args.format == "json" else markdown(report)
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
