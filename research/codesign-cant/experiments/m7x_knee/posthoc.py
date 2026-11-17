"""Milestone 7x, post hoc (not predicted): per-seed Mann-Whitney U (two-sided) on L2-45 counts, lag52 and lag60 against lag45,
per geometry and law. Six designs per set: a guide to seed noise, not a test."""
import json, os
from scipy.stats import mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs = R["runs"]
L = [__doc__.strip().splitlines()[0]]
for law in R["laws"]:
    for new in ("aware lag52", "aware lag60"):
        for g in ("above", "below"):
            x = [r["dead_45_2_cap"] for r in sorted(runs, key=lambda r: r["seed"]) if r["set"] == new and r["geom"] == g and r["law_name"] == law]
            y = [r["dead_45_2_cap"] for r in sorted(runs, key=lambda r: r["seed"]) if r["set"] == "aware lag45" and r["geom"] == g and r["law_name"] == law]
            p = mannwhitneyu(x, y, alternative="two-sided").pvalue if x != y else 1.0
            L.append(f"  {law:>21} {new} {g}: {sum(x)} vs lag45 {sum(y)}, p = {p:.3f}")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
