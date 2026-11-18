"""Milestone 7n figure from results.json: crashes with the cap at levers 2 and 3 per set (left) and, for the arm swaps, each
design's lever-2, 45 deg crash count before and after only its arm is changed (right)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R, LABS = D["runs"], D["labels"]
COLS = ["#7f7f7f", "#c0603a", "#e6a88f", "#3b6ea8", "#9ecae1", "#2ca02c"]
MARK = {"above": "o", "below": "s"}
KEY = "45_2_cap"


def dead(lab, key):
    return sum(r[f"dead_{key}"] for r in R if r["label"] == lab)


def get(lab, g, s):
    return next(r for r in R if r["label"] == lab and r["geom"] == g and r["seed"] == s)


fig, (a, b) = plt.subplots(1, 2, figsize=(12, 4.4), gridspec_kw=dict(width_ratios=[1.5, 1]))
conds = [("20_2_cap", "lever 2, 20°"), ("45_2_cap", "lever 2, 45°"), ("20_3_cap", "lever 3, 20°")]
x = np.arange(len(conds)); w = 0.8 / len(LABS)
for k, (lab, c) in enumerate(zip(LABS, COLS)):
    v = [dead(lab, key) for key, _ in conds]
    a.bar(x + (k - (len(LABS) - 1) / 2) * w, v, w, color=c, label=lab)
    for xi, d in zip(x, v):
        a.text(xi + (k - (len(LABS) - 1) / 2) * w, d + 4, str(d), ha="center", fontsize=6)
a.set_xticks(x); a.set_xticklabels([t for _, t in conds], fontsize=8)
a.set_ylabel("diverged flights of 768 (12 designs × 64)"); a.set_title("crashes with the cap, both geometries", fontsize=10)
a.legend(fontsize=7, frameon=False, loc="upper left")
for src, dst, c in (("7l t45 cap wide", "7l long arm", COLS[1]), ("aware cap wide", "7m short arm", COLS[3])):
    for g in ("above", "below"):
        for s in sorted({r["seed"] for r in R if r["label"] == src and r["geom"] == g}):
            r0, r1 = get(src, g, s), get(dst, g, s)
            b.annotate("", xy=(r1["L"] * 1000, r1[f"dead_{KEY}"]), xytext=(r0["L"] * 1000, r0[f"dead_{KEY}"]),
                       arrowprops=dict(arrowstyle="->", color=c, lw=1.0))
            b.scatter([r0["L"] * 1000], [r0[f"dead_{KEY}"]], color=c, marker=MARK[g], s=20, edgecolor="none")
for lab, c in (("7l t45 cap wide → long arm", COLS[1]), ("aware cap wide → short arm", COLS[3])):
    b.plot([], [], color=c, label=lab)
for g in ("above", "below"):
    b.scatter([], [], marker=MARK[g], color="#444444", label=f"{g} geometry")
b.set_xlabel("frame arm L (mm)"); b.set_ylabel(f"diverged of 64, lever 2, 45°, cap")
b.set_title("only the arm changed", fontsize=10); b.legend(fontsize=7, frameon=False, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7n_fixed_arm.png"), dpi=130)
