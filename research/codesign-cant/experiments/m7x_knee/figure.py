"""Milestone 7x figure: diverged flights at lever 2, 45 deg (cap, of 384 per set) against the lag the designs are flown at, one
line per tuning floor (lever-aware arm: 39.1 ms 7u, 45 ms 7w, 52 and 60 ms 7x); one panel per geometry. Writes m7x_knee.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
LAWS = ["id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 45 ms D^0", "stress 52 ms D^0", "stress 60 ms D^0"]
XS = [33, 36, 39.1, 45, 52, 60]
STY = {"aware lag39": ("tuned at 39.1 ms (7u)", "#2e8b57"), "aware lag45": ("tuned at 45 ms (7w)", "#8b3a8b"),
       "aware lag52": ("tuned at 52 ms, 33 ms certified (7x)", "#c0632b"), "aware lag60": ("tuned at 60 ms, 33 ms certified (7x)", "#b22222")}
fig, ax = plt.subplots(1, 2, figsize=(10, 4.4), sharey=True)
for a, g in zip(ax, ("above", "below")):
    for s, (nm, col) in STY.items():
        ys = [sum(r["dead_45_2_cap"] for r in R["runs"] if r["set"] == s and r["geom"] == g and r["law_name"] == law) for law in LAWS]
        a.plot(XS, ys, "o-", color=col, label=nm)
    a.axvspan(33, 39.1, color="#ececec", zorder=-1)
    a.set_title(f"centre of pressure {g} the centre of mass", fontsize=9)
    a.set_xlabel("motor lag flown (ms; shaded: identified range, 33-39.1 ms)")
    a.spines[["top", "right"]].set_visible(False)
ax[0].set_ylabel("diverged flights of 384 (lever 2, 45°, cap)")
h, l = ax[0].get_legend_handles_labels()
fig.legend(h, l, fontsize=8, frameon=False, loc="upper center", ncol=2)
fig.tight_layout(rect=(0, 0, 1, 0.86))
fig.savefig(os.path.join(HERE, "m7x_knee.png"), dpi=130)
print("wrote m7x_knee.png")
