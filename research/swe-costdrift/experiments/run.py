import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from swe_costdrift.cd import load, drift, daily_medians

runs = load()
print(f"priced runs with tool calls and a start time: {len(runs)}")
for label, key in (("cost per run", "cost_usd"), ("cost per tool call", "per_call"), ("tool calls per run", "calls")):
    print(f"\n== {label}: log-trend, % per day (Theil-Sen, 95% bootstrap over runs)")
    for t in ["ALL", "research", "ventures", "process", "redteam", "explore", "review"]:
        s = runs if t == "ALL" else [r for r in runs if r.get("track") == t]
        if len(s) < 20:
            continue
        p, lo, hi = drift(s, key)
        print(f"{t:9s} n={len(s):4d} {p:+6.1f}%/day  [{lo:+6.1f}, {hi:+6.1f}]")
print("\n== daily median cost per run, USD (days with >=5 runs)")
for t in ["research", "ventures", "process", "redteam"]:
    print(t, " ".join(f"{d[5:]}:{m:.2f}(n={n})" for d, n, m in daily_medians([r for r in runs if r.get("track") == t])))
