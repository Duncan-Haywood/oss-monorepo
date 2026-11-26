#!/usr/bin/env python3
"""Snapshot the federal grants a 501(c)(3) can apply for on Grants.gov today.

Reads the keyless Grants.gov REST API (https://www.grants.gov/api/api-guide):
search2 lists every *posted* opportunity whose eligible applicants include
code 12 ("Nonprofits having a 501(c)(3) status with the IRS, other than
institutions of higher education") or 99 ("Unrestricted"), then
fetchOpportunity reads each one's award floor and ceiling, cost sharing,
close date and applicant types.

    python3 snapshot.py fetch  --out snapshot.json   # about 500 API calls
    python3 snapshot.py report snapshot.json         # the tables in the post

Standard library only. Behind a TLS-inspecting proxy set SSL_CERT_FILE.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import re
import sys
import time
import urllib.request
from collections import Counter

API = "https://api.grants.gov/v1/api"
CODES = {"12": "501(c)(3) nonprofits", "99": "Unrestricted"}
RESEARCH_AGENCIES = {"NIH", "NSF", "DOD", "NASA"}  # top-agency or sub-agency codes


def post(path: str, body: dict, tries: int = 4) -> dict:
    data = json.dumps(body).encode()
    for attempt in range(tries):
        try:
            req = urllib.request.Request(f"{API}/{path}", data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:  # network blips: back off and retry
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def search(code: str) -> list[dict]:
    hits, start = [], 0
    while True:
        d = post("search2", {"oppStatuses": "posted", "eligibilities": code, "rows": 250, "startRecordNum": start})["data"]
        page = d.get("oppHits") or []
        hits += page
        start += len(page)
        if not page or start >= (d.get("hitCount") or 0):
            return hits


def as_list(v) -> list:
    """applicantTypes and categories come back as Python-repr strings or lists."""
    if isinstance(v, list):
        return v
    if isinstance(v, str) and v.startswith("["):
        import ast
        try:
            return ast.literal_eval(v)
        except (ValueError, SyntaxError):
            return []
    return []


def as_dict(v) -> dict:
    if isinstance(v, dict):
        return v
    if isinstance(v, str) and v.startswith("{"):
        import ast
        try:
            return ast.literal_eval(v)
        except (ValueError, SyntaxError):
            return {}
    return {}


def money(v) -> int | None:
    try:
        return int(str(v).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


def detail(opp_id: str) -> dict:
    d = post("fetchOpportunity", {"opportunityId": int(opp_id)})["data"]
    s = d.get("synopsis") or {}
    top = as_dict(s.get("topAgencyDetails")).get("code") or as_dict(d.get("topAgencyDetails")).get("code")
    sub = as_dict(s.get("agencyDetails")).get("code")
    return {
        "id": str(opp_id),
        "number": d.get("opportunityNumber"),
        "title": d.get("opportunityTitle"),
        "top_agency": top,
        "agency": sub,
        "agency_name": s.get("agencyName"),
        "close": (s.get("responseDateStr") or "")[:10] or None,
        "posted": (s.get("postingDateStr") or "")[:10] or None,
        "cost_sharing": s.get("costSharing"),
        "award_floor": money(s.get("awardFloor")),
        "award_ceiling": money(s.get("awardCeiling")),
        "estimated_funding": money(s.get("estimatedFunding")),
        "expected_awards": money(s.get("numberOfAwards")),
        "applicant_types": sorted({str(a.get("id")) for a in as_list(s.get("applicantTypes")) if isinstance(a, dict)}),
        "categories": sorted({str(a.get("id")) for a in as_list(s.get("fundingActivityCategories")) if isinstance(a, dict)}),
        "instruments": sorted({str(a.get("id")) for a in as_list(s.get("fundingInstruments")) if isinstance(a, dict)}),
    }


def fetch(out: str) -> None:
    ids: dict[str, set[str]] = {}
    for code in CODES:
        for h in search(code):
            ids.setdefault(str(h["id"]), set()).add(code)
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(detail, sorted(ids)))
    for r in rows:
        r["search_codes"] = sorted(ids[r["id"]])
    snap = {
        "taken_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Grants.gov REST API search2 + fetchOpportunity, oppStatuses=posted",
        "opportunities": rows,
    }
    with open(out, "w") as f:
        json.dump(snap, f, indent=1, sort_keys=True)
    print(f"{len(rows)} opportunities -> {out}")


RESEARCH_TITLE = re.compile(r"\((R|U|K|P|T|F|S|D|G|X)\d\d")  # NIH-style activity codes: (R01), (U01) ...


def is_research(r: dict) -> bool:
    """A heuristic: research agencies, or an NIH-style activity code in the title."""
    return (
        r["top_agency"] in RESEARCH_AGENCIES
        or r["agency"] in RESEARCH_AGENCIES
        or bool(RESEARCH_TITLE.search(r["title"] or ""))
    )


def ceiling(r: dict) -> int | None:
    """0 and 1 are placeholders on Grants.gov ("none" is already None)."""
    c = r["award_ceiling"]
    return c if c and c > 1 else None


def report(path: str) -> dict:
    snap = json.load(open(path))
    rows = snap["opportunities"]
    today = dt.date.fromisoformat(snap["taken_utc"][:10])

    def days(r):
        return (dt.date.fromisoformat(r["close"]) - today).days if r["close"] else None

    research = [r for r in rows if is_research(r)]
    rest = [r for r in rows if not is_research(r)]
    ceilings = sorted(c for c in map(ceiling, rest) if c)
    small = [r for r in rest if ceiling(r) and ceiling(r) <= 100_000]
    return {
        "taken_utc": snap["taken_utc"],
        "posted_open_to_501c3": len(rows),
        "listing_501c3_by_name": sum(1 for r in rows if "12" in r["applicant_types"]),
        "unrestricted_only": sum(1 for r in rows if "12" not in r["applicant_types"]),
        "research": len(research),
        "research_nih": sum(1 for r in research if r["agency"] == "NIH"),
        "research_nsf": sum(1 for r in research if r["top_agency"] == "NSF"),
        "program": len(rest),
        "program_cost_sharing": sum(1 for r in rest if r["cost_sharing"] is True),
        "program_ceiling_stated": len(ceilings),
        "program_ceiling_median": ceilings[len(ceilings) // 2] if ceilings else None,
        "program_ceiling_le_100k": len(small),
        "program_ceiling_le_250k": sum(1 for c in ceilings if c <= 250_000),
        "program_ceiling_ge_1m": sum(1 for c in ceilings if c >= 1_000_000),
        "program_close_30d": sum(1 for r in rest if days(r) is not None and 0 <= days(r) <= 30),
        "program_close_90d": sum(1 for r in rest if days(r) is not None and 0 <= days(r) <= 90),
        "program_no_close_date": sum(1 for r in rest if days(r) is None),
        "program_top_agencies": Counter(r["top_agency"] for r in rest).most_common(8),
        "program_ceiling_le_100k_list": sorted(
            ({k: r[k] for k in ("number", "title", "agency", "close", "award_floor", "award_ceiling", "cost_sharing")} for r in small),
            key=lambda r: r["close"] or "9999",
        ),
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--out", default="snapshot.json")
    r = sub.add_parser("report")
    r.add_argument("snapshot")
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        fetch(a.out)
    else:
        print(json.dumps(report(a.snapshot), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
