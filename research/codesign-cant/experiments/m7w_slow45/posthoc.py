"""Milestone 7w, post hoc (not predicted): per-seed Mann-Whitney U (two-sided) on L2-45 counts, lag45 against lag39, per arm,
geometry and law; and a sign test over the four arm-geometries per law. Six designs per set: a guide to seed noise, not a test."""
import json, os
from scipy.stats import binomtest, mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
L = [__doc__.strip().splitlines()[0]]
for law in ("inherited 15 ms D^1.5", "id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 45 ms D^0"):
    wins = losses = 0
    for a in ("7l", "aware"):
        for g in ("above", "below"):
            x = [r["dead_45_2_cap"] for r in runs if r["set"] == f"{a} lag45" and r["geom"] == g and r["law_name"] == law]
            y = [r["dead_45_2_cap"] for r in runs if r["set"] == f"{a} lag39" and r["geom"] == g and r["law_name"] == law]
            p = mannwhitneyu(x, y, alternative="two-sided").pvalue if (x != y) else 1.0
            wins += sum(x) < sum(y); losses += sum(x) > sum(y)
            L.append(f"  {law:>21} {a:>5} {g}: lag45 {sum(x)} vs lag39 {sum(y)}, p = {p:.3f}")
    n = wins + losses
    L.append(f"  {law:>21} sign test: lag45 fewer in {wins}, more in {losses} of 4" + (f", two-sided p = {binomtest(wins, n).pvalue:.3f}" if n else ""))
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
