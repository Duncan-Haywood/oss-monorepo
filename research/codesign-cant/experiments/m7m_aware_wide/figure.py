"""Milestone 7m figure from results.json: crashes at levers 2 and 3 with the cap (left) and each design's mass against its
position kp (right)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R, LABS = D["runs"], D["labels"]
COLS = ["#7f7f7f", "#2ca02c", "#c0603a", "#9ecae1", "#3b6ea8"]
MARK = {"above": "o", "below": "s"}


def dead(lab, key):
    return sum(r[f"dead_{key}"] for r in R if r["label"] == lab)


fig, (a, b) = plt.subplots(1, 2, figsize=(11.5, 4.4), gridspec_kw=dict(width_ratios=[1.4, 1]))
conds = [("20_2_cap", "lever 2, 20°"), ("45_2_cap", "lever 2, 45°"), ("20_3_cap", "lever 3, 20°")]
x = np.arange(len(conds)); w = 0.8 / len(LABS)
for k, (lab, c) in enumerate(zip(LABS, COLS)):
    v = [dead(lab, key) for key, _ in conds]
    a.bar(x + (k - (len(LABS) - 1) / 2) * w, v, w, color=c, label=lab)
    for xi, d in zip(x, v):
        a.text(xi + (k - (len(LABS) - 1) / 2) * w, d + 4, str(d), ha="center", fontsize=6.5)
a.set_xticks(x); a.set_xticklabels([t for _, t in conds], fontsize=8)
a.set_ylabel("diverged flights of 768 (12 designs × 64)"); a.set_title("crashes with the cap, both geometries", fontsize=10)
a.legend(fontsize=7, frameon=False, loc="upper left")
for lab, c in zip(LABS, COLS):
    for g in ("above", "below"):
        rs = [r for r in R if r["label"] == lab and r["geom"] == g]
        b.scatter([r["pos_kp"] for r in rs], [r["mass"] for r in rs], s=22, color=c, marker=MARK[g], edgecolor="none")
for g in ("above", "below"):
    b.scatter([], [], marker=MARK[g], color="#444444", label=f"{g} geometry")
b.axvline(10.0, color="#999999", lw=0.8, ls="--"); b.axvline(10 ** 1.5, color="#999999", lw=0.8, ls=":")
b.set_xscale("log"); b.set_xlabel("chosen position kp (s⁻²); box edges 10 and 31.6"); b.set_ylabel("vehicle mass (kg)")
b.set_title("what the stiffness is spent on", fontsize=10); b.legend(fontsize=7, frameon=False, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7m_aware_wide.png"), dpi=130)
