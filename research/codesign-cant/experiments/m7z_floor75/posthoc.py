"""Milestone 7z, post hoc (not predicted): per-seed Mann-Whitney U (two-sided), lag75 against lag60, on (a) L2-45 crashes per
design at each identified law and (b) each design's median rise time, overshoot and 6 m/s peak drift at the 36 ms law; (c)
designs that never settle within 5 cm on most flights, with their last-second distance and position kp."""
import json, os
import numpy as np
from scipy.stats import mannwhitneyu

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, resp = R["runs"], R["resp"]
N, O, LAW = "aware lag75", "aware lag60", "mid 36 ms D^0"
L = [" ".join(__doc__.split()), ""]
for law in ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 60 ms D^0", "stress 75 ms D^0"):
    for g in ("above", "below"):
        a = [r["dead_45_2_cap"] for r in runs if r["set"] == N and r["geom"] == g and r["law_name"] == law]
        b = [r["dead_45_2_cap"] for r in runs if r["set"] == O and r["geom"] == g and r["law_name"] == law]
        L.append(f"(a) L2-45 {law:>16} {g:>5}: lag75 {sorted(a)} vs lag60 {sorted(b)}, p = {mannwhitneyu(a, b, alternative='two-sided').pvalue:.3f}")
L.append("")


def per(test, g, s, key):
    return [float(np.nanmedian(np.where(np.asarray(r[key], float) == 0, np.inf, r[key]) if key == "rise" else r[key])) for r in sorted(resp, key=lambda r: r["seed"])
            if r["test"] == test and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]


for test, key in (("step", "rise"), ("step", "over"), ("wind6", "peak")):
    for g in ("above", "below"):
        a, b = per(test, g, N, key), per(test, g, O, key)
        L.append(f"(b) {test} {key:>4} {g:>5}: lag75 median {np.median(a):.4f} vs lag60 {np.median(b):.4f}, p = {mannwhitneyu(a, b, alternative='two-sided').pvalue:.3f}")
L.append("")
for r in sorted(resp, key=lambda r: (r["set"], r["geom"], r["seed"])):
    if r["test"] != "step" or r["law_name"] != LAW:
        continue
    st = np.asarray(r["settle"], float)
    if np.isnan(st).mean() >= 0.5:
        L.append(f"(c) {r['set']} {r['geom']} seed {r['seed']}: unsettled {int(np.isnan(st).sum())}/64; last-second distance median "
                 f"{np.nanmedian(r['tail_off']) * 100:.1f} cm, x peak-to-peak median {np.nanmedian(r['tail_pp']) * 100:.1f} cm; pos kp {r['pos_kp']:.1f}; dead {r['dead']}")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
