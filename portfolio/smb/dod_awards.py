#!/usr/bin/env python3
"""Which businesses hold Department of Defense prime contracts under a NAICS code, from USAspending.

    python3 portfolio/smb/dod_awards.py 332710
    python3 portfolio/smb/dod_awards.py 332710 332312 332322 --fy 2025 --small
    python3 portfolio/smb/dod_awards.py 332710 --small --by-state --top 10
    python3 portfolio/smb/dod_awards.py 332710 --small --csv /tmp/shops.csv   # one row per business
    python3 portfolio/smb/dod_awards.py 332710 --small --fy 2025 --years 5   # FY2021-FY2025
    python3 portfolio/smb/dod_awards.py 332710 --json

It asks the public USAspending API (api.usaspending.gov, no key) for every DoD prime contract
(award types A-D: BPA calls, purchase orders, delivery orders, definitive contracts) coded with
the NAICS code and active in the federal fiscal year (1 Oct to 30 Sep), then counts the distinct
recipients (by UEI), the contracts, and where the recipients are (state of the recipient's
address, not of the work). `--small` keeps recipients the contract records as a small business.

What it measures, and what it does not (say this wherever a figure is quoted):
- The NAICS code is the *contract's*, chosen by the contracting officer, not the firm's primary
  code: a distributor that sells machined parts appears under 332710, and a machine shop that
  sells under 336413 does not. So "businesses holding DoD contracts coded 332710", not "machine
  shops with DoD work".
- Prime contracts only. Most small shops on defense work are subcontractors to a prime, and
  subawards are reported unevenly; this is a floor on the reachable defense shops, not a count.
- DoD publishes contract actions to FPDS with a 90-day delay, so the latest fiscal year is
  incomplete until about January.
- "Award Amount" is the award's total obligated value, which can include years before the one
  asked for.

Why this exists: bets #2 (job shop quoting) and #4 (CMMC workspace) sell to the same small machine
shops, and bets.md had the Census count of all machine shops (cbp_counts.py) but no count of the
ones on defense work, who are the CMMC buyers. The per-business CSV is for prospect research
(public federal records of businesses); it is written only where --csv says, never into the tree.

Source and field docs: https://api.usaspending.gov/docs/endpoints (POST
/api/v2/search/spending_by_award/). Checked from a cloud session on 2026-11-27.
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

API = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
CONTRACT_TYPES = ["A", "B", "C", "D"]
FIELDS = ["Award ID", "Recipient Name", "Recipient UEI", "Award Amount", "Recipient Location", "NAICS",
          "Awarding Sub Agency"]
PAGE = 100


def fiscal_year(fy: int, years: int = 1) -> dict:
    """FY2026 runs 1 Oct 2025 to 30 Sep 2026; years=3 starts at FY2024's first day."""
    return {"start_date": f"{fy - years}-10-01", "end_date": f"{fy}-09-30"}


def request_body(naics: list[str], fy: int, small: bool, page: int, years: int = 1) -> dict:
    filters = {
        "award_type_codes": CONTRACT_TYPES,
        "naics_codes": {"require": naics},
        "time_period": [fiscal_year(fy, years)],
        "agencies": [{"type": "awarding", "tier": "toptier", "name": "Department of Defense"}],
    }
    if small:
        filters["recipient_type_names"] = ["small_business"]
    return {"filters": filters, "fields": FIELDS, "limit": PAGE, "page": page,
            "sort": "Award ID", "order": "asc"}


def post(body: dict, tries: int = 4) -> dict:
    data = json.dumps(body).encode()
    for attempt in range(tries):
        req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json",
                                                               "User-Agent": "smb-counts/1"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == tries - 1:
                raise
            print(f"retrying after {e}", file=sys.stderr)
            time.sleep(2 ** attempt * 3)
    raise AssertionError("unreachable")


def fetch(naics: list[str], fy: int, small: bool, fetcher=post, years: int = 1) -> list[dict]:
    rows, page = [], 1
    while True:
        out = fetcher(request_body(naics, fy, small, page, years))
        rows.extend(out.get("results", []))
        if not out.get("page_metadata", {}).get("hasNext"):
            return rows
        page += 1


def summarise(rows: list[dict]) -> dict:
    """Distinct recipients by UEI (name when a row has none), their states and award sizes."""
    by_firm: dict[str, dict] = {}
    seen_awards = set()
    buyers: Counter = Counter()
    for r in rows:
        award = r.get("Award ID")
        if award in seen_awards:
            continue
        seen_awards.add(award)
        buyers[r.get("Awarding Sub Agency") or "unknown"] += 1
        key = r.get("Recipient UEI") or (r.get("Recipient Name") or "").strip().upper()
        loc = r.get("Recipient Location") or {}
        firm = by_firm.setdefault(key, {
            "uei": r.get("Recipient UEI"),
            "name": r.get("Recipient Name"),
            "state": loc.get("state_code"),
            "city": loc.get("city_name"),
            "country": loc.get("location_country_code"),
            "contracts": 0,
            "award_total": 0.0,
        })
        firm["contracts"] += 1
        firm["award_total"] += float(r.get("Award Amount") or 0)
    firms = list(by_firm.values())
    states = Counter(f["state"] for f in firms if f["country"] == "USA" and f["state"])
    totals = [f["award_total"] for f in firms]
    per_firm = [f["contracts"] for f in firms]
    return {
        "contracts": len(seen_awards),
        "recipients": len(firms),
        "recipients_outside_us": sum(1 for f in firms if f["country"] not in (None, "USA")),
        "one_contract_only": sum(1 for n in per_firm if n == 1),
        "median_award_total": round(statistics.median(totals), 2) if totals else None,
        "recipients_under_250k": sum(1 for t in totals if t < 250_000),
        "states": dict(states.most_common()),
        "buyers": dict(buyers.most_common()),
        "firms": sorted(firms, key=lambda f: -f["award_total"]),
    }


def write_csv(path: str, firms: list[dict]) -> None:
    cols = ["name", "uei", "city", "state", "country", "contracts", "award_total"]
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for f in firms:
            w.writerow({c: f[c] for c in cols})


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("naics", nargs="+", help="6-digit NAICS codes, read together (any of them)")
    ap.add_argument("--fy", type=int, default=2026, help="federal fiscal year (default 2026)")
    ap.add_argument("--years", type=int, default=1,
                    help="fiscal years ending with --fy, read as one span (default 1)")
    ap.add_argument("--small", action="store_true", help="small-business recipients only")
    ap.add_argument("--by-state", action="store_true", help="print recipients per state")
    ap.add_argument("--top", type=int, default=15, help="states to print with --by-state")
    ap.add_argument("--csv", help="write one row per recipient to this path (keep it out of the repo)")
    ap.add_argument("--json", action="store_true", help="print the summary as JSON (no firm list)")
    a = ap.parse_args(argv)
    for code in a.naics:
        if not (code.isdigit() and len(code) == 6):
            ap.error(f"not a 6-digit NAICS code: {code}")

    if a.years < 1:
        ap.error("--years must be at least 1")
    s = summarise(fetch(a.naics, a.fy, a.small, years=a.years))
    if a.csv:
        write_csv(a.csv, s["firms"])
    if a.json:
        print(json.dumps({k: v for k, v in s.items() if k != "firms"} |
                         {"naics": a.naics, "fy": a.fy, "years": a.years, "small": a.small},
                         indent=2))
        return 0
    who = "small-business recipients" if a.small else "recipients"
    span = fiscal_year(a.fy, a.years)
    fys = f"FY{a.fy}" if a.years == 1 else f"FY{a.fy - a.years + 1}-FY{a.fy}"
    print(f"DoD prime contracts coded {', '.join(a.naics)}, active in {fys}"
          f" ({span['start_date']} to {span['end_date']}):")
    print(f"  {s['contracts']:,} contracts, {s['recipients']:,} distinct {who}"
          f" ({s['recipients_outside_us']} outside the US)")
    print(f"  {s['one_contract_only']:,} with a single contract; median total award value "
          f"${s['median_award_total']:,.0f}; {s['recipients_under_250k']:,} under $250k in total")
    print("  contracts by awarding agency: " +
          "; ".join(f"{k} {v:,}" for k, v in list(s["buyers"].items())[:5]))
    if a.by_state:
        for st, n in list(s["states"].items())[: a.top]:
            print(f"  {st} {n:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
