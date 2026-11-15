"""Milestone 7o figure from results.json: lever-2, 45 deg crashes (cap) against frame arm L per set, summed over the seeds that are
ok at each point (left: full sizing; middle: frontal area and centre-of-pressure lever pinned), and the number of ok seeds (right)."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R, GRID = D["runs"], D["grid"]
LABS = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
COLS = ["#7f7f7f", "#c0603a", "#3b6ea8", "#2ca02c"]
LS = {"above": "-", "below": "--"}


def curve(lab, g, key):
    rs = [r for r in R if r["label"] == lab and r["geom"] == g]
    xs, ys, ns = [], [], []
    for L in GRID:
        ok = [(r, r["L"].index(L)) for r in rs if r["rho"][r["L"].index(L)] < 1.0 and r["feasible"][r["L"].index(L)]]
        ns.append(len(ok))
        if len(ok) == len(rs):   # all seeds ok: comparable across L
            xs.append(L * 1000); ys.append(sum(r[key][j] for r, j in ok))
    return xs, ys, ns


fig, axs = plt.subplots(1, 3, figsize=(14, 4.4), gridspec_kw=dict(width_ratios=[1.2, 1.2, 1]))
for lab, c in zip(LABS, COLS):
    for g in ("above", "below"):
        for ax, mode in zip(axs[:2], ("resize", "pinexp")):
            xs, ys, _ = curve(lab, g, f"dead_{mode}_45_2")
            ax.plot(xs, ys, LS[g], color=c, marker="o", ms=3, label=f"{lab}, {g}")
        _, _, ns = curve(lab, g, "dead_resize_45_2")
        axs[2].plot(np.array(GRID) * 1000, ns, LS[g], color=c, marker="o", ms=3)
for ax, t in zip(axs[:2], ("full sizing (area and CoP lever grow with L)", "area and CoP lever held at own-L values")):
    ax.set_xlabel("frame arm L (mm)"); ax.set_ylabel("diverged of 384, lever 2, 45°, cap"); ax.set_title(t, fontsize=10)
axs[0].legend(fontsize=6, frameon=False, ncol=2)
axs[2].set_xlabel("frame arm L (mm)"); axs[2].set_ylabel("seeds ok (margin test and feasibility), of 6")
axs[2].set_title("where the fixed tune is still a valid design", fontsize=10)
fig.text(0.01, 0.01, "Curves drawn only where all six seeds are ok.", fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7o_arm_sweep.png"), dpi=130)
