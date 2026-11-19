"""Milestone 7aa, post hoc (not predicted): per-seed Mann-Whitney U (two-sided), lag39c150 against lag39 and against lag75, on
(a) L2-45 crashes per design at each law from 33 to 75 ms and (b) each design's median rise time, overshoot and 6 m/s peak
drift at the 36 ms law; (c) designs that never settle within 5 cm on most flights."""
import json, os
import numpy as np
from scipy.stats import mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, resp = R["runs"], R["resp"]
N, LAW = "aware lag39c150", "mid 36 ms D^0"
L = [" ".join(__doc__.split()), ""]


def p(a, b):
    return mannwhitneyu(a, b, alternative="two-sided").pvalue if (a != b or len(set(a)) > 1) else 1.0


for O in ("aware lag39", "aware lag75"):
    for law in ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 45 ms D^0", "stress 60 ms D^0", "stress 75 ms D^0"):
        for g in ("above", "below"):
            a = [r["dead_45_2_cap"] for r in runs if r["set"] == N and r["geom"] == g and r["law_name"] == law]
            b = [r["dead_45_2_cap"] for r in runs if r["set"] == O and r["geom"] == g and r["law_name"] == law]
            L.append(f"(a) L2-45 {law:>16} {g:>5}: lag39c150 {sorted(a)} (sum {sum(a)}) vs {O.split()[1]} {sorted(b)} (sum {sum(b)}), p = {p(a, b):.3f}")
    L.append("")


def per(test, g, s, key):
    return [float(np.nanmedian(np.where(np.asarray(r[key], float) == 0, np.inf, r[key]) if key == "rise" else r[key])) for r in sorted(resp, key=lambda r: r["seed"])
            if r["test"] == test and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]


for O in ("aware lag39", "aware lag75"):
    for test, key in (("step", "rise"), ("step", "over"), ("wind6", "peak")):
        for g in ("above", "below"):
            a, b = per(test, g, N, key), per(test, g, O, key)
            L.append(f"(b) {test} {key:>4} {g:>5}: lag39c150 median {np.median(a):.4f} vs {O.split()[1]} {np.median(b):.4f}, p = {p(a, b):.3f}")
L.append("")
for r in sorted(resp, key=lambda r: (r["set"], r["geom"], r["seed"])):
    if r["test"] != "step" or r["law_name"] != LAW:
        continue
    st = np.asarray(r["settle"], float)
    if np.isnan(st).mean() >= 0.5:
        L.append(f"(c) {r['set']} {r['geom']} seed {r['seed']}: unsettled {int(np.isnan(st).sum())}/64; last-second distance median "
                 f"{np.nanmedian(r['tail_off']) * 100:.1f} cm; pos kp {r['pos_kp']:.1f}; dead {r['dead']}")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
