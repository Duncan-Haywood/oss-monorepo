#!/usr/bin/env python3
"""Cross-check every suppressed finding in the portfolio sample against ground
truth the triage engine's own parser did not produce.

This is a structural companion to the hand-verification in
[`wrong-suppression-verification-2026-08-21.json`](wrong-suppression-verification-2026-08-21.json)
(read advisory text, reason about it). It answers a narrower question a
different way: for the two *structural* rules — `dependency-path` and
`build-surface`, whose evidence is a fact on disk rather than a reading of
prose — does the engine's own parsed fact match the raw file? A bug shared
between the engine and this script would have to be the same bug written
twice.

- ``dependency-path`` suppressions: re-read each install location's ``dev``
  flag straight out of ``package-lock.json`` with the standard library ``json``
  module, bypassing ``triage.lockfile`` entirely. A mismatch means the engine
  suppressed on a fact that is not what the lockfile says.
- ``build-surface`` and ``dependency-path`` suppressions: confirm the package
  is not in the project's own ``package.json`` ``dependencies`` block,
  independently of ``triage.sources``. A ``devDependencies`` entry for the same
  package name is expected and not a problem — it is usually a different,
  non-vulnerable version (Tailwind's own PostCSS, for example) — so this checks
  only the production block, the same signal ``context.uses_directly`` uses.
- ``server-surface:*`` suppressions: re-read ``next.config.*`` from disk with a
  plain string search for ``output: "export"`` / ``output: 'export'``,
  independently of ``triage.deployment``. A suppression resting on a
  deployment mode the config file does not actually declare is wrong.

What this script does not automate: whether an advisory's *text* really
describes a server-only surface (the ``server-surface:*`` sub-rule) is a
reading question, not a re-derivable fact — that is what the hand
verification is for.

Usage::

    python3 verify_suppressions.py <path-to-osv-npm-all.zip> [repo-root]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from triage.advisories import load_osv_zip  # noqa: E402
from triage.deployment import detect  # noqa: E402
from triage.engine import ProjectContext, triage  # noqa: E402
from triage.graph import build_from_lockfile  # noqa: E402
from triage.lockfile import parse_lockfile  # noqa: E402
from triage.sources import declared_production_dependencies, scan_project_imports  # noqa: E402

EXPORT_PATTERN = re.compile(r"""output\s*:\s*["']export["']""")


def _raw_lockfile_dev(lockfile: Path, path: str) -> bool | None:
    data = json.loads(lockfile.read_text())
    entry = data.get("packages", {}).get(path)
    if entry is None:
        return None
    return bool(entry.get("dev", False))


def _raw_production_dependency(project: Path, package: str) -> bool:
    """Whether ``package.json``'s ``dependencies`` block (not ``devDependencies``)
    names ``package`` directly — read fresh, independently of ``triage.sources``.

    Checking the whole manifest rather than this one block would false-positive
    on every suppression this script exists to check: the suppressed install
    location is a *different, dev-only copy* of a package the project also
    keeps as an ordinary devDependency (eslint, postcss for Tailwind, wrangler),
    which is expected and is not what makes a suppression wrong.
    """
    manifest = project / "package.json"
    if not manifest.exists():
        return False
    data = json.loads(manifest.read_text())
    return package in data.get("dependencies", {})


def _raw_next_config_declares_export(project: Path) -> bool:
    for name in ("next.config.js", "next.config.mjs", "next.config.ts"):
        config = project / name
        if config.exists() and EXPORT_PATTERN.search(config.read_text()):
            return True
    return False


def _check(project: Path, finding, lockfile: Path) -> dict | None:
    """Return a problem dict if ground truth disagrees with the engine, else None."""
    if finding.rule == "dependency-path":
        for location in finding.locations:
            raw = _raw_lockfile_dev(lockfile, location.path)
            if raw is None:
                return {"reason": f"install location {location.path!r} not found in lockfile at all"}
            if raw is not True:
                return {
                    "reason": (
                        f"lockfile marks {location.path!r} dev={raw!r} directly, "
                        f"not True — the engine's own parser disagrees with the raw file"
                    )
                }
        if _raw_production_dependency(project, finding.package):
            return {"reason": f"{finding.package!r} is declared in this project's own package.json"}
        return None

    if finding.rule == "build-surface":
        if _raw_production_dependency(project, finding.package):
            return {"reason": f"{finding.package!r} is declared in this project's own package.json"}
        return None

    if finding.rule and finding.rule.startswith("server-surface"):
        if not _raw_next_config_declares_export(project):
            return {"reason": "next.config.* on disk does not literally declare output: \"export\""}
        return None

    if finding.rule == "dev-server-surface":
        return None

    return {"reason": f"unrecognised rule {finding.rule!r} — script does not know how to check it"}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    archive = Path(sys.argv[1]).read_bytes()
    root = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parents[4])

    lockfiles = sorted(
        path
        for path in (root / "ventures").rglob("package-lock.json")
        if "node_modules" not in path.parts
    )

    total_suppressed = 0
    problems = []
    by_rule_total: dict[str, int] = {}

    for lockfile in lockfiles:
        project = lockfile.parent
        installed = parse_lockfile(lockfile)
        names = {package.name for package in installed}
        advisories = load_osv_zip(archive, names)
        profile = detect(project)
        context = ProjectContext(
            dependency_graph=build_from_lockfile(lockfile),
            declared_dependencies=declared_production_dependencies(project),
            source_imports=scan_project_imports(project),
        )
        findings = triage(installed, advisories, profile, context)

        for finding in findings:
            if not finding.suppressed:
                continue
            total_suppressed += 1
            by_rule_total[finding.rule] = by_rule_total.get(finding.rule, 0) + 1
            problem = _check(project, finding, lockfile)
            if problem is not None:
                problems.append(
                    {
                        "project": str(project.relative_to(root)),
                        "advisory_id": finding.advisory_id,
                        "package": finding.package,
                        "rule": finding.rule,
                        **problem,
                    }
                )

    report = {
        "total_suppressed": total_suppressed,
        "by_rule": dict(sorted(by_rule_total.items())),
        "wrong_suppressions": problems,
        "wrong_suppression_rate": round(100 * len(problems) / total_suppressed, 1) if total_suppressed else 0.0,
    }
    print(json.dumps(report, indent=2))
    Path("wrong-suppression-structural-check-2026-08-21.json").write_text(json.dumps(report, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
