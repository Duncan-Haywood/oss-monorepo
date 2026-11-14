"""Figure for milestone 7i. Left: held-out flights that diverged (of 384 per set) at levers 2 and 3, 20 deg tilt-command limit,
for 7e's designs (lever-1 objective, thrust-to-weight 2), 7h's retrained designs (lever-1 objective, thrust-to-weight free) and the
two lever-aware arms. Right: each design's mass against its diverged flights at lever 3 (post hoc; posthoc.txt). Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
ARMS = (("7e", "7e: lever 1, TWR 2", "#1f77b4", "o"), ("7h free", "7h: lever 1, TWR free", "#2ca02c", "^"),
        ("aware TWR=2.0", "lever 0-2, TWR 2", "#ff7f0e", "s"), ("aware TWR free", "lever 0-2, TWR free", "#d62728", "D"))
GEOMS = ("above", "below")
COND = [(g, lev) for g in GEOMS for lev in (2, 3)]

fig, ax = plt.subplots(1, 2, figsize=(12, 4.6))
x = np.arange(len(COND)); w = 0.2
for j, (lab, name, col, _) in enumerate(ARMS):
    v = [sum(r[f"dead_20_{lev}"] for r in runs if r["label"] == lab and r["geom"] == g) for g, lev in COND]
    xs = x + (j - 1.5) * w
    ax[0].bar(xs, v, width=w, color=col, label=name)
    for xi, vi in zip(xs, v):
        ax[0].text(xi, vi, str(vi), ha="center", va="bottom", fontsize=7)
ax[0].set_xticks(x); ax[0].set_xticklabels([f"{g}, lever {lev}" for g, lev in COND])
ax[0].set_ylabel("held-out flights diverged, 20° limit (of 384)")
ax[0].set_title("Centre-of-pressure lever 2 (in lever-aware training) and 3 (in none)")
ax[0].legend(fontsize=8)
for lab, name, col, mk in ARMS:
    for g, fill in zip(GEOMS, (True, False)):
        rs = [r for r in runs if r["label"] == lab and r["geom"] == g]
        ax[1].scatter([r["mass"] for r in rs], [r["dead_20_3"] for r in rs], c=col if fill else "none", edgecolors=col, marker=mk,
                      label=f"{name}, {g}")
ax[1].set_xlabel("vehicle mass at thrust-to-weight as designed (kg)"); ax[1].set_ylabel("flights diverged at lever 3, 20° (of 64)")
ax[1].set_title("Heavier designs survive the larger lever (filled: above, open: below)")
ax[1].legend(fontsize=7, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7i_aware.png"), dpi=130)
print("wrote m7i_aware.png")
