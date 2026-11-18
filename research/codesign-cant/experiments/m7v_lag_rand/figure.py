"""Milestone 7v figure: diverged flights at lever 2, 45 deg (cap, of 384 per set) for designs tuned at 36 ms (7t), 39.1 ms (7u) and
across 33-39.1 ms (7v), under each scoring law (ordered by lag); one panel per geometry. Writes m7v_lag_rand.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
LAWS = ["inherited 15 ms D^1.5", "id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 45 ms D^0"]
LAB = ["15 ms, D^1.5\n(inherited)", "33 ms\n(NeuroBEM)", "36 ms\n(midpoint)", "39.1 ms\n(Agilicious)", "45 ms\n(stress, unsourced)"]
STY = {"7l lag36": ("7l objective, tuned at 36 ms (7t)", "#9ab7d8"),
       "aware lag36": ("lever-aware, tuned at 36 ms (7t)", "#9fd0b0"),
       "7l lag39": ("7l objective, tuned at 39.1 ms (7u)", "#3b6ea8"),
       "aware lag39": ("lever-aware, tuned at 39.1 ms (7u)", "#2e8b57"),
       "7l lagrand": ("7l objective, trained across 33-39.1 ms (7v)", "#c0632b"),
       "aware lagrand": ("lever-aware, trained across 33-39.1 ms (7v)", "#8b3a8b")}
fig, ax = plt.subplots(1, 2, figsize=(11, 4.8), sharey=True)
w = 0.14
for a, g in zip(ax, ("above", "below")):
    for i, (s, (nm, col)) in enumerate(STY.items()):
        ys = [sum(r["dead_45_2_cap"] for r in R["runs"] if r["set"] == s and r["geom"] == g and r["law_name"] == law) for law in LAWS]
        a.bar(np.arange(len(LAWS)) + (i - 2.5) * w, ys, w, color=col, label=nm)
    a.axvspan(0.5, 3.5, color="#f2f2f2", zorder=-1)
    a.set_xticks(np.arange(len(LAWS)), LAB, fontsize=7.5)
    a.set_title(f"centre of pressure {g} the centre of mass", fontsize=9)
    a.set_xlabel("motor lag the designs are scored under (shaded: identified range)")
    a.spines[["top", "right"]].set_visible(False)
ax[0].set_ylabel("diverged flights of 384 (lever 2, 45°, cap)")
h, l = ax[0].get_legend_handles_labels()
fig.legend(h, l, fontsize=8, frameon=False, loc="upper center", ncol=3)
fig.tight_layout(rect=(0, 0, 1, 0.88))
fig.savefig(os.path.join(HERE, "m7v_lag_rand.png"), dpi=130)
print("wrote m7v_lag_rand.png")
