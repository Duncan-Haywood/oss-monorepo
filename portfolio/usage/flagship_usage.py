#!/usr/bin/env python3
"""Put usage next to the flagship list: which deep products do people open?

`portfolio/flagships.yaml` decides where most venture runs go, and
`portfolio/router/allocate.py` ranks it with no usage input at all. The weekly
engagement report (`platform/counter/engagement-report.mjs`) counts page
loads per page but does not say which of those pages are flagships, or which
non-flagship tool is pulling more people than the flagships. This joins the
two, so a run choosing what to deepen, or an agent proposing a reorder, can
cite a number instead of a guess.

    python3 portfolio/usage/flagship_usage.py [--days 14] [--top 8] [--json]

Data: `site-visits.json` from the `usage-data` branch when it can be read
(`git show origin/usage-data:site-visits.json`; fetch it with
`git fetch --depth=1 origin usage-data`), else `portfolio/usage/site-visits.json`.
Page loads are anonymous, cookieless counts, not people
(`portfolio/usage/README.md`); "crawled" means a crawler beacon loaded the
page at least once in the window. Usage is unmeasured, not zero, for any page
the beacon does not run on: a low count is a reason to look, never by itself a
reason to drop a flagship.
"""
import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FLAGSHIPS = ROOT / "portfolio" / "flagships.yaml"
LOCAL = ROOT / "portfolio" / "usage" / "site-visits.json"


def flagships(path=FLAGSHIPS):
    """Venture slugs in file order (no YAML dependency: `- venture: slug` lines)."""
    return re.findall(r"^\s*-\s*venture:\s*([a-z0-9][a-z0-9-]*)\s*$", Path(path).read_text(), re.M)


def load_visits(root=ROOT):
    try:
        out = subprocess.run(["git", "show", "origin/usage-data:site-visits.json"], cwd=root,
                             capture_output=True, text=True, timeout=30, check=True).stdout
        return json.loads(out), "usage-data branch"
    except (OSError, subprocess.SubprocessError, ValueError):
        return json.loads(LOCAL.read_text()), str(LOCAL.relative_to(ROOT))


def summarise(visits, flags, ventures, days=14, today=None, top=8):
    all_days = sorted(visits.get("days", {}))
    end = dt.date.fromisoformat(today) if today else (dt.date.fromisoformat(all_days[-1]) if all_days else dt.date.today())
    start = (end - dt.timedelta(days=days - 1)).isoformat()
    loads, seen, crawled = Counter(), Counter(), set()
    for day in all_days:
        if not (start <= day <= end.isoformat()):
            continue
        for key, n in visits["days"][day].items():
            if key.startswith("botpage:"):
                crawled.add(key[8:])
            elif ":" not in key and n:
                loads[key] += n
                seen[key] += 1
    rows = [{"rank": i, "venture": v, "loads": loads[v], "days_seen": seen[v], "crawled": v in crawled}
            for i, v in enumerate(flags, 1)]
    others = [{"venture": v, "loads": n, "days_seen": seen[v]}
              for v, n in loads.most_common() if v in ventures and v not in flags][:top]
    tool_total = sum(n for v, n in loads.items() if v in ventures)
    return {"window": [start, end.isoformat()], "flagships": rows, "top_non_flagship_tools": others,
            "tool_loads": tool_total, "flagship_loads": sum(r["loads"] for r in rows)}


def render(s, source):
    a, b = s["window"]
    out = [f"Flagship usage, {a} to {b} (source: {source}).",
           f"Tool page loads: {s['tool_loads']}, of which flagships {s['flagship_loads']}.", "",
           "| # | flagship | loads | days seen | crawled |", "|---:|---|---:|---:|---|"]
    out += [f"| {r['rank']} | {r['venture']} | {r['loads']} | {r['days_seen']} | {'yes' if r['crawled'] else 'no'} |"
            for r in s["flagships"]]
    out += ["", "Non-flagship tools people opened most:"]
    out += [f"- {o['venture']}: {o['loads']} loads on {o['days_seen']} day(s)" for o in s["top_non_flagship_tools"]] or ["- none"]
    best = max((r["loads"] for r in s["flagships"]), default=0)
    lead = [o for o in s["top_non_flagship_tools"] if o["loads"] > best and (o["days_seen"] >= 2 or o["loads"] >= 3)]
    if lead:
        out += ["", "Pulling more loads than every flagship: " + ", ".join(o["venture"] for o in lead)
                + ". Worth a look when the list is next reordered (seen on two or more days or three or more loads; counts this small are noisy)."]
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--today", default=None, help="window end, YYYY-MM-DD (default: last day in the data)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    visits, source = load_visits()
    ventures = {p.name for p in (ROOT / "ventures").iterdir() if p.is_dir()}
    s = summarise(visits, flagships(), ventures, a.days, a.today, a.top)
    print(json.dumps(s, indent=2) if a.json else render(s, source))
    return 0


if __name__ == "__main__":
    sys.exit(main())
