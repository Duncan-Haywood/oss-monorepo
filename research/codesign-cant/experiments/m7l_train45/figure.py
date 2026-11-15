"""Milestone 7l figure from results.json: crashes per arm at a 45-deg limit (left) and the position kp each design chose (right)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R, LABS = D["runs"], D["labels"]
COL = {"above": "#3b6ea8", "below": "#c0603a"}


def dead(lab, key):
    return sum(r[f"dead_{key}"] for r in R if r["label"] == lab)


fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw=dict(width_ratios=[1.5, 1]))
conds = [("45_0_base", "45°, lever 0, no cap"), ("45_1_base", "45°, lever 1, no cap"), ("45_1_cap", "45°, lever 1, cap"),
         ("45_1_base_off1", "45°, lever 1, 1.0 m offset, no cap"), ("45_1_cap_off1", "45°, lever 1, 1.0 m offset, cap")]
x = np.arange(len(LABS)); w = 0.8 / len(conds)
shades = ["#9ecae1", "#3b6ea8", "#08306b", "#fdae6b", "#c0603a"]
for k, ((key, lab), c) in enumerate(zip(conds, shades)):
    v = [dead(l, key) for l in LABS]
    a.bar(x + (k - (len(conds) - 1) / 2) * w, np.maximum(v, 0.6), w, color=c, label=lab)
    for xi, d in zip(x, v):
        a.text(xi + (k - (len(conds) - 1) / 2) * w, max(d, 0.6) * 1.15, str(d), ha="center", fontsize=6.5)
a.set_yscale("log"); a.set_ylim(0.5, 30000); a.set_xticks(x); a.set_xticklabels(LABS, fontsize=8)
a.set_ylabel("diverged flights of 768 (12 designs × 64)"); a.set_title("crashes at a 45° tilt limit, both geometries", fontsize=10)
a.legend(fontsize=7, frameon=False, loc="upper left", ncol=2)
for i, l in enumerate(LABS):
    for j, g in enumerate(("above", "below")):
        kp = [r["pos_kp"] for r in R if r["label"] == l and r["geom"] == g]
        b.scatter(np.full(len(kp), i + (j - 0.5) * 0.25), kp, s=18, color=COL[g], label=g if i == 0 else None)
b.axhline(10.0, color="#999999", lw=0.8, ls="--"); b.text(-0.3, 10.6, "inherited box edge 10 s⁻²", fontsize=7, ha="left", color="#666666")
b.axhline(10 ** 1.5, color="#999999", lw=0.8, ls=":"); b.text(-0.3, 10 ** 1.5 * 0.94, "widened edge 31.6 s⁻²", fontsize=7, ha="left", color="#666666")
b.set_yscale("log"); b.set_xticks(range(len(LABS))); b.set_xticklabels(LABS, fontsize=8)
b.set_ylim(8, 40); b.set_ylabel("chosen position kp (s⁻²)"); b.set_title("position gain each design chose", fontsize=10); b.legend(fontsize=7, frameon=False, loc="center left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7l_train45.png"), dpi=130)
