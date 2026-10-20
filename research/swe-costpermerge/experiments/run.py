"""Summarise experiments/costs_merge_snapshot.jsonl. Prints results.txt."""
import json, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_costpermerge.join import summarise

runs = [json.loads(l) for l in open(os.path.join(HERE, "costs_merge_snapshot.jsonl"))]
s = summarise(runs)
a = s["all"]
print(f"priced runs {a['n']}   dates {min(r['date'] for r in runs)} to {max(r['date'] for r in runs)}   total spend ${a['spend']:.2f}")
print(f"status: merged PR on main {a['merged']}, record names no PR {a['no_pr']}, PR not found on main {a['not_found']}")
print(f"merged share {100 * a['rate']:.0f}% (Wilson {100 * a['rate_lo']:.0f}% to {100 * a['rate_hi']:.0f}%)")
print(f"cost per merged run ${a['per_merged']:.2f} (bootstrap {a['per_merged_lo']:.2f} to {a['per_merged_hi']:.2f}); cost per priced run ${a['spend'] / a['n']:.2f}")
print(f"spend on runs with no merged PR on record: {100 * a['unmerged_share']:.0f}%")
print("\ntrack     runs merged no_pr  merged%(Wilson)    $/merged (bootstrap)    $/run  spend_unmerged%")
for t, v in sorted(s.items(), key=lambda kv: -kv[1]["n"]):
    if t == "all":
        continue
    pm = f"{v['per_merged']:.2f} ({v['per_merged_lo']:.2f} to {v['per_merged_hi']:.2f})" if v["per_merged"] else "n/a"
    print(f"  {t:9s}{v['n']:4d} {v['merged']:6d} {v['no_pr']:6d}  {100 * v['rate']:3.0f}% ({100 * v['rate_lo']:.0f}-{100 * v['rate_hi']:.0f})   {pm:26s} {v['spend'] / v['n']:6.2f}  {100 * v['unmerged_share']:5.0f}%")
mc = [r["cost_usd"] for r in runs if r["status"] == "merged"]
uc = [r["cost_usd"] for r in runs if r["status"] == "no_pr"]
print(f"\nmedian cost, merged runs ${statistics.median(mc):.2f} (n={len(mc)}); runs naming no PR ${statistics.median(uc):.2f} (n={len(uc)})")
