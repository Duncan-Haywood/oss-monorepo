#!/usr/bin/env python3
"""Mark venues verified from the runner's page checks (raw/venues/checks.json).

A venue is `fetched_official_page` only when its own URL answered 200 with a
page title; the title and check date are kept as the evidence. A 404 is
recorded as a broken link; anything else (403, 202 bot walls, timeouts)
leaves the row as `listed_from_search`.

    python3 pipeline/apply_venue_checks.py --raw RAW --communities data/communities.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def apply(venues: list[dict], checks: list[dict]) -> dict:
    by_id = {c["id"]: c for c in checks}
    counts = {"verified": 0, "broken": 0, "unchanged": 0, "unchecked": 0}
    for v in venues:
        c = by_id.get(v["id"])
        if not c or c.get("url") != v.get("public_url"):
            counts["unchecked"] += 1
            continue
        day = c["checked_at"][:10]
        if c.get("status") == 200 and c.get("title"):
            v["verification"] = "fetched_official_page"
            v["verified_at"] = day
            v["verified_title"] = c["title"]
            v.pop("link_status", None)
            counts["verified"] += 1
        elif c.get("status") == 404:
            v["verification"] = "listed_from_search"
            v["verified_at"] = None
            v["link_status"] = f"404 on {day}"
            counts["broken"] += 1
        else:
            v["link_status"] = f"{c.get('status') or 'no answer'} on {day} (not readable by the checker)"
            counts["unchanged"] += 1
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", required=True)
    ap.add_argument("--communities", default=str(Path(__file__).resolve().parent.parent / "data" / "communities.json"))
    a = ap.parse_args()
    doc = json.loads(Path(a.communities).read_text())
    checks = json.loads((Path(a.raw) / "venues" / "checks.json").read_text())
    counts = apply(doc["venues"], checks)
    Path(a.communities).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
