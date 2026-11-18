"""Milestone 7y, post hoc (not predicted): (a) per-seed Mann-Whitney U (two-sided), lag60 against lag45, on each design's median
rise time, overshoot and 6 m/s peak drift at the 36 ms law; (b) why some designs never settle within 5 cm: their mean distance
and x peak-to-peak over the last second of the step test."""
import json, os
import numpy as np
from scipy.stats import mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
LAW = "mid 36 ms D^0"
L = [" ".join(__doc__.split()), ""]


def per(test, g, s, key):
    return [float(np.median(r[key])) for r in sorted(runs, key=lambda r: r["seed"])
            if r["test"] == test and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]


for test, key in (("step", "rise"), ("step", "over"), ("wind6", "peak")):
    for g in ("above", "below"):
        a, b = per(test, g, "aware lag60", key), per(test, g, "aware lag45", key)
        L.append(f"(a) {test} {key:>4} {g:>5}: lag60 median {np.median(a):.4f} vs lag45 {np.median(b):.4f}, p = {mannwhitneyu(a, b, alternative='two-sided').pvalue:.3f}")
L.append("")
for r in sorted(runs, key=lambda r: (r["set"], r["geom"], r["seed"])):
    if r["test"] != "step" or r["law_name"] != LAW:
        continue
    st = np.asarray(r["settle"], float)
    if np.isnan(st).mean() >= 0.5:
        L.append(f"(b) {r['set']} {r['geom']} seed {r['seed']}: unsettled {int(np.isnan(st).sum())}/64; last-second distance median "
                 f"{np.median(r['tail_off']) * 100:.1f} cm, x peak-to-peak median {np.median(r['tail_pp']) * 100:.1f} cm; pos kp {r['pos_kp']:.1f}")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
