"""Milestone 7u, post hoc (not predicted): per-seed Mann-Whitney U (two-sided) on L2-45 counts, lag39 against lag36, per arm,
geometry and identified law. Six designs per set; read as a guide to how much of each gap is seed noise, not as a confirmatory test."""
import json, os
from scipy.stats import mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
L = [__doc__.strip().splitlines()[0]]
for law in ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 45 ms D^0"):
    for a in ("7l", "aware"):
        for g in ("above", "below"):
            x = [r["dead_45_2_cap"] for r in runs if r["set"] == f"{a} lag39" and r["geom"] == g and r["law_name"] == law]
            y = [r["dead_45_2_cap"] for r in runs if r["set"] == f"{a} lag36" and r["geom"] == g and r["law_name"] == law]
            p = mannwhitneyu(x, y, alternative="two-sided").pvalue
            L.append(f"  {law:>17} {a:>5} {g}: lag39 {sum(x)} vs lag36 {sum(y)}, p = {p:.3f}")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
