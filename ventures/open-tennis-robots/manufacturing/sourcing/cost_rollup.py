"""Roll the collector's sourced BOM up to a unit cost at 10, 100 and 1,000 units.

    python3 cost_rollup.py                # prints the markdown table
    python3 cost_rollup.py --check        # fails if a priced row lacks a URL or a check date

Rules (stdlib only, no network):
- Each row of collector_bom_sourced.csv is one BOM line with `qty_per_unit`
  and up to four published price breaks `pN_qty`/`pN_usd` (USD per supplier
  unit, where a supplier unit holds `pack` pieces).
- For a build of B robots we need ceil(qty_per_unit * B / pack) supplier units
  and use the best published break at or below that count. No discount is
  assumed beyond what the page published, so 100 and 1,000 are upper bounds.
- Rows with status `no_published_price` carry no number and are listed as
  gaps, never estimated here.
"""
from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV = HERE / "collector_bom_sourced.csv"
BUILDS = (10, 100, 1000)


def load(path: Path = CSV) -> list[dict]:
    with path.open(newline="") as f:
        rows = [r for r in csv.DictReader(line for line in f if not line.startswith("#"))]
    return rows


def breaks(row: dict) -> list[tuple[int, float]]:
    out = []
    for i in range(1, 5):
        q, p = row.get(f"p{i}_qty", ""), row.get(f"p{i}_usd", "")
        if q.strip() and p.strip():
            out.append((int(q), float(p)))
    return sorted(out)


def line_cost(row: dict, build: int) -> float | None:
    """USD for this BOM line across `build` robots, or None if unpriced."""
    bk = breaks(row)
    if not bk:
        return None
    pack = int(row.get("pack") or 1)
    units = max(math.ceil(float(row["qty_per_unit"]) * build / pack), int(row.get("moq") or 1))
    price = bk[0][1]
    for q, p in bk:
        if units >= q:
            price = p
    return units * price


def rollup(rows: list[dict]) -> dict:
    totals = {b: 0.0 for b in BUILDS}
    groups: dict[str, dict[int, float]] = {}
    gaps = []
    for r in rows:
        for b in BUILDS:
            c = line_cost(r, b)
            if c is None:
                continue
            totals[b] += c / b
            groups.setdefault(r["group"], {x: 0.0 for x in BUILDS})[b] += c / b
        if not breaks(r):
            gaps.append(r["bom_item"])
    return {"per_unit": totals, "groups": groups, "gaps": sorted(set(gaps))}


def check(rows: list[dict]) -> list[str]:
    errs = []
    for r in rows:
        tag = r.get("bom_item", "?")
        if breaks(r):
            if not r.get("url", "").startswith("http"):
                errs.append(f"{tag}: priced but no supplier URL")
            if not r.get("checked", "").startswith("20"):
                errs.append(f"{tag}: priced but no date checked")
        elif r.get("status") != "no_published_price":
            errs.append(f"{tag}: no price and status is not no_published_price")
    return errs


def table(res: dict) -> str:
    lines = ["| Group | per unit @10 | @100 | @1,000 |", "| --- | ---: | ---: | ---: |"]
    for g, v in sorted(res["groups"].items()):
        lines.append(f"| {g} | ${v[10]:,.2f} | ${v[100]:,.2f} | ${v[1000]:,.2f} |")
    t = res["per_unit"]
    lines.append(f"| **Priced total** | **${t[10]:,.2f}** | **${t[100]:,.2f}** | **${t[1000]:,.2f}** |")
    if res["gaps"]:
        lines.append("")
        lines.append("Not in the total (no published price found): " + ", ".join(res["gaps"]) + ".")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    rows = load()
    errs = check(rows)
    if errs:
        print("\n".join(errs), file=sys.stderr)
        return 1
    if not a.check:
        print(table(rollup(rows)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
