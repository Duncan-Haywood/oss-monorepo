#!/usr/bin/env python3
"""How many businesses a bet can sell to: Census County Business Patterns counts by NAICS code.

    python3 portfolio/smb/cbp_counts.py 238 2382 332710
    python3 portfolio/smb/cbp_counts.py 238 --by-state --top 10
    python3 portfolio/smb/cbp_counts.py 332710 --year 2022 --json

It downloads the Census Bureau's public CBP flat file for the year (national, or by state with
--by-state) from www2.census.gov, caches it under ~/.cache/cbp, and prints for each code the
employer establishments, paid employees in the week of March 12, and the establishments with
fewer than 20 and fewer than 100 employees (the size classes CBP publishes; the sum of the
n<5 ... n50_99 columns). Only rows for all legal forms (lfo "-") are read.

Why this exists: bets.md and VERTICALS.md cited third-party or estimated buyer counts because
api.census.gov now needs a key and redirects to missing_key.html. The flat files need no key and
answer from cloud sessions (checked 2026-11-27). CBP counts employer establishments only: sole
proprietors with no employees are in Nonemployer Statistics, not here.

Source: https://www.census.gov/programs-surveys/cbp/data/datasets.html (record layout:
https://www2.census.gov/programs-surveys/cbp/technical-documentation/records-layouts/2022_record_layouts/).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://www2.census.gov/programs-surveys/cbp/datasets/{year}/cbp{yy}{geo}.zip"
UNDER_20 = ("n<5", "n5_9", "n10_19")
UNDER_100 = UNDER_20 + ("n20_49", "n50_99")

# State FIPS codes to postal abbreviations (the 50 states and DC).
STATES = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
    "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
    "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
    "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
}


def cbp_code(naics: str) -> str:
    """'238' -> '238///', '23' -> '23----', '332710' -> '332710' (CBP's padded six-character form)."""
    code = naics.strip().rstrip("/-")
    if not code.isdigit() or not 2 <= len(code) <= 6:
        raise ValueError(f"not a NAICS code: {naics!r}")
    if len(code) == 2:
        return code + "----"
    return code + "/" * (6 - len(code))


def _int(value: str | None) -> int | None:
    value = (value or "").strip()
    return int(value) if value.isdigit() else None


def summarise(row: dict) -> dict:
    """One CBP row -> the counts this tool prints. Employment is None when Census withheld it."""
    sizes = [_int(row.get(k)) for k in UNDER_100]
    return {
        "naics": row["naics"],
        "establishments": _int(row.get("est")),
        "employees": None if (row.get("emp_nf") or "").strip() == "D" else _int(row.get("emp")),
        "establishments_under_20": sum(n or 0 for n in sizes[: len(UNDER_20)]),
        "establishments_under_100": sum(n or 0 for n in sizes),
    }


def read_rows(text: io.TextIOBase, codes: list[str]) -> list[dict]:
    """Rows for the given CBP codes, all legal forms only, in file order."""
    wanted = set(codes)
    out = []
    for row in csv.DictReader(text):
        if row.get("lfo", "-") != "-" or row.get("naics") not in wanted:
            continue
        item = summarise(row)
        if "fipstate" in row:
            item["state"] = STATES.get(row["fipstate"], row["fipstate"])
        out.append(item)
    return out


def fetch(year: int, by_state: bool, cache: Path) -> Path:
    geo = "st" if by_state else "us"
    url = BASE.format(year=year, yy=str(year)[-2:], geo=geo)
    path = cache / Path(url).name
    if not path.exists():
        cache.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        req = urllib.request.Request(url, headers={"User-Agent": "cbp-counts/1"})
        with urllib.request.urlopen(req, timeout=300) as resp, open(tmp, "wb") as fh:
            fh.write(resp.read())
        os.replace(tmp, path)
    return path


def open_text(zip_path: Path) -> io.TextIOBase:
    zf = zipfile.ZipFile(zip_path)
    name = next(n for n in zf.namelist() if n.endswith(".txt"))
    return io.TextIOWrapper(zf.open(name), encoding="latin-1", newline="")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("naics", nargs="+", help="NAICS codes, 2 to 6 digits (238, 2382, 332710)")
    ap.add_argument("--year", type=int, default=2022, help="CBP reference year (default 2022)")
    ap.add_argument("--by-state", action="store_true", help="one row per state, largest first")
    ap.add_argument("--top", type=int, default=0, help="with --by-state, only the largest N per code")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a table")
    ap.add_argument("--file", type=Path, help="a CBP .zip already on disk (skips the download)")
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "cbp")
    args = ap.parse_args(argv)

    try:
        codes = [cbp_code(c) for c in args.naics]
    except ValueError as exc:
        ap.error(str(exc))
    path = args.file or fetch(args.year, args.by_state, args.cache)
    rows = read_rows(open_text(path), codes)
    if args.by_state:
        rows.sort(key=lambda r: (codes.index(r["naics"]), -(r["establishments"] or 0)))
        if args.top:
            kept, seen = [], {}
            for r in rows:
                seen[r["naics"]] = seen.get(r["naics"], 0) + 1
                if seen[r["naics"]] <= args.top:
                    kept.append(r)
            rows = kept
    else:
        rows.sort(key=lambda r: codes.index(r["naics"]))
    missing = [c for c in codes if c not in {r["naics"] for r in rows}]

    if args.json:
        print(json.dumps({"year": args.year, "source": str(path.name), "rows": rows, "missing": missing}, indent=2))
    else:
        print(f"County Business Patterns {args.year} ({path.name}); employer establishments, all legal forms")
        head = ("state  " if args.by_state else "") + "naics    establishments  <20 emp  <100 emp  employees"
        print(head)
        for r in rows:
            emp = f"{r['employees']:,}" if r["employees"] is not None else "withheld"
            prefix = f"{r.get('state', ''):<7}" if args.by_state else ""
            print(f"{prefix}{r['naics']:<8} {r['establishments'] or 0:>14,} {r['establishments_under_20']:>8,} "
                  f"{r['establishments_under_100']:>9,} {emp:>10}")
        for c in missing:
            print(f"{c}: not in this file (check the code against the year's NAICS edition)", file=sys.stderr)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
