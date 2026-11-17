"""Milestone 7t figure: diverged flights at lever 2, 45 deg (cap, of 384 per set) for 7r's retuned designs and the designs retuned
at the identified 36 ms lag, under each of the five scoring laws; one panel per geometry. Writes m7t_lag_src.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
LAWS = ["inherited 15 ms D^1.5", "id 33 ms D^0", "train 36 ms D^0", "id 39.1 ms D^0", "36 ms D^1.5"]
LAB = ["15 ms, D^1.5\n(inherited)", "33 ms\n(NeuroBEM)", "36 ms\n(trained)", "39.1 ms\n(Agilicious)", "36 ms, D^1.5"]
STY = {"7l src_li [src_li]": ("7l objective, tuned at 15 ms (7r)", "#9ab7d8"),
       "aware src_li [src_li]": ("lever-aware, tuned at 15 ms (7r)", "#9fd0b0"),
       "7l lag36": ("7l objective, tuned at 36 ms (7t)", "#3b6ea8"),
       "aware lag36": ("lever-aware, tuned at 36 ms (7t)", "#2e8b57")}
fig, ax = plt.subplots(1, 2, figsize=(11, 4.4), sharey=True)
w = 0.2
for a, g in zip(ax, ("above", "below")):
    for i, (s, (nm, col)) in enumerate(STY.items()):
        ys = [sum(r["dead_45_2_cap"] for r in R["runs"] if r["set"] == s and r["geom"] == g and r["law_name"] == law) for law in LAWS]
        a.bar(np.arange(len(LAWS)) + (i - 1.5) * w, ys, w, color=col, label=nm)
    a.set_xticks(np.arange(len(LAWS)), LAB, fontsize=7.5)
    a.set_title(f"centre of pressure {g} the centre of mass", fontsize=9)
    a.set_xlabel("motor lag the designs are scored under")
    a.spines[["top", "right"]].set_visible(False)
ax[0].set_ylabel("diverged flights of 384 (lever 2, 45°, cap)")
h, l = ax[0].get_legend_handles_labels()
fig.legend(h, l, fontsize=8, frameon=False, loc="upper center", ncol=4)
fig.tight_layout(rect=(0, 0, 1, 0.93))
fig.savefig(os.path.join(HERE, "m7t_lag_src.png"), dpi=130)
print("wrote m7t_lag_src.png")
