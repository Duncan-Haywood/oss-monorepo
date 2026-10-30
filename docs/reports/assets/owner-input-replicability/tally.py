"""Tally the owner's inputs by how replaceable they are by agents or software.

Reads the hand labels in labels.csv (one row per run record that began from a
person's words, as found by docs/reports/assets/human-asks/count_asks.py),
joins each to its run record in prompts/runs/ for cost, and adds the two
inputs that are not run records: scheduled triggers and the decision queue.

    python3 docs/reports/assets/owner-input-replicability/tally.py

Tiers (the rubric is in docs/reports/2026-10-24-owner-input-replicability.md):
  1 already software   2 an agent could supply it today
  3 agent detects or drafts, the owner's word made it stick
  4 rests on the owner's interests, values or risk appetite
  5 needs the owner's legal standing, money or account access
Tier 0 rows (duplicates, agent-written follow-ups) are dropped.
"""
import collections
import csv
import glob
import json
import os
import re
import statistics as st
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../../.."))
sys.path.insert(0, os.path.join(ROOT, "docs/reports/assets/human-asks"))
from count_asks import scheduled  # noqa: E402

TIER_NAMES = {1: "already software", 2: "agent could supply", 3: "agent detects, owner decides",
              4: "owner's interests/values", 5: "owner's legal standing/accounts"}


def main():
    labels = {r["session"]: r for r in csv.DictReader(open(os.path.join(HERE, "labels.csv")))}
    runs = {}
    for f in glob.glob(os.path.join(ROOT, "prompts/runs/*.json")):
        try:
            d = json.load(open(f))
        except (OSError, ValueError):
            continue
        if str(d.get("date") or "") <= "2026-10-24":
            runs[os.path.basename(f)[:-5]] = d
    direct = {k for k, d in runs.items() if not scheduled(d.get("input"))}
    missing = sorted(direct - labels.keys())
    if missing:
        print("unlabelled direct runs:", missing)
    rows = [r for k, r in labels.items() if k in direct and int(r["tier"]) > 0]
    n = len(rows)
    print(f"owner inputs labelled: {n} (of {len(direct)} direct run records; "
          f"{len(direct) - n} dropped as duplicates or agent-written)")

    print("\nby tier")
    tiers = collections.Counter(int(r["tier"]) for r in rows)
    for t in sorted(tiers):
        print(f"  {t} {TIER_NAMES[t]:32s} {tiers[t]:3d}  {100 * tiers[t] / n:4.0f}%")

    print("\nby type (tier mix, median cost of the run it started)")
    by_type = collections.defaultdict(list)
    for r in rows:
        by_type[r["type"]].append(r)
    for typ, rs in sorted(by_type.items(), key=lambda kv: -len(kv[1])):
        mix = collections.Counter(int(r["tier"]) for r in rs)
        cost = [runs[r["session"]].get("cost_usd") for r in rs]
        cost = [c for c in cost if isinstance(c, (int, float))]
        med = f"${st.median(cost):.2f} on {len(cost)}" if cost else "unmeasured"
        print(f"  {typ:12s} {len(rs):3d}  tiers {dict(sorted(mix.items()))}  median cost {med}")

    sched = len(runs) - len(direct)
    print(f"\nscheduled triggers (tier 1, already software): {sched} run records")
    out = subprocess.run([sys.executable, "portfolio/ledger/decision_queue.py"], cwd=ROOT,
                         capture_output=True, text=True).stdout
    queue = re.findall(r"^\d+\.\s+(\S+).*exposure (\S+), (\d+)d", out, re.M)
    print(f"decision queue (tier 5): {len(queue)} items, exposure "
          f"{dict(collections.Counter(e for _, e, _ in queue))}, "
          f"median wait {st.median(int(d) for *_, d in queue)} days")


if __name__ == "__main__":
    main()
