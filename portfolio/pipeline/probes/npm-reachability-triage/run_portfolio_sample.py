#!/usr/bin/env python3
"""Run the triage across this portfolio's own npm products and summarise.

This is the validation harness, not part of the product. It exists so the
suppression rates can be compared against the independent manual review in
``portfolio/research/cra-advisory-reachability/``, which classified the same
products by hand.

Usage::

    python3 run_portfolio_sample.py <path-to-osv-npm-all.zip> [repo-root]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from triage.advisories import load_osv_zip  # noqa: E402
from triage.deployment import detect  # noqa: E402
from triage.engine import DEV_ONLY, NOT_DEPLOYED, SHIPPED, triage  # noqa: E402
from triage.lockfile import parse_lockfile  # noqa: E402


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

    rows = []
    for lockfile in lockfiles:
        project = lockfile.parent
        installed = parse_lockfile(lockfile)
        names = {package.name for package in installed}
        advisories = load_osv_zip(archive, names)
        profile = detect(project)
        findings = triage(installed, advisories, profile)

        total = len(findings)
        shipped = sum(1 for f in findings if f.verdict == SHIPPED)
        rows.append(
            {
                "project": str(project.relative_to(root)),
                "mode": profile.mode,
                "components": len(installed),
                "findings": total,
                "shipped": shipped,
                "dev_only": sum(1 for f in findings if f.verdict == DEV_ONLY),
                "not_deployed": sum(1 for f in findings if f.verdict == NOT_DEPLOYED),
                "suppression_rate": round(100 * (total - shipped) / total, 1) if total else 0.0,
            }
        )

    width = max(len(row["project"]) for row in rows)
    header = f"{'project'.ljust(width)}  {'mode':<14} {'comp':>5} {'find':>5} {'ship':>5} {'dev':>4} {'ndep':>5} {'supp%':>6}"
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['project'].ljust(width)}  {row['mode']:<14} {row['components']:>5} "
            f"{row['findings']:>5} {row['shipped']:>5} {row['dev_only']:>4} "
            f"{row['not_deployed']:>5} {row['suppression_rate']:>6}"
        )

    totals = {key: sum(row[key] for row in rows) for key in ("components", "findings", "shipped", "dev_only", "not_deployed")}
    print("-" * len(header))
    print(
        f"{'TOTAL'.ljust(width)}  {'':<14} {totals['components']:>5} {totals['findings']:>5} "
        f"{totals['shipped']:>5} {totals['dev_only']:>4} {totals['not_deployed']:>5} "
        f"{round(100 * (totals['findings'] - totals['shipped']) / totals['findings'], 1):>6}"
    )

    Path("sample-results.json").write_text(json.dumps(rows, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
