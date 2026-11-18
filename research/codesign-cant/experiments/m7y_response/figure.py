"""Milestone 7y figure: what each tuning floor buys and costs at the 36 ms law. Left: 7x's diverged flights in the lever-2 stress
test over the identified range (33 + 36 + 39.1 ms, of 1152 per set) against this milestone's rise time to 90% of a 1 m step at
lever 1, one point per floor, one line per geometry. Right: step overshoot and peak drift after a 6 m/s wind step against the
floor. Medians over seeds of each design's median over 64 episodes. Writes m7y_response.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["runs"]
X = json.load(open(os.path.join(HERE, "..", "m7x_knee", "results.json")))["runs"]
SETS = ["aware lag39", "aware lag45", "aware lag52", "aware lag60"]
FL = [39.1, 45, 52, 60]
ID = ["id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0"]
LAW = "mid 36 ms D^0"
COL = {"above": "#1f6fb2", "below": "#c0392b"}


def m(test, g, s, key):
    return float(np.median([np.median(r[key]) for r in R if r["test"] == test and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]))


fig, ax = plt.subplots(1, 2, figsize=(10.5, 4.3))
for g in ("above", "below"):
    rise = [m("step", g, s, "rise") for s in SETS]
    dead = [sum(r["dead_45_2_cap"] for r in X if r["set"] == s and r["geom"] == g and r["law_name"] in ID) for s in SETS]
    ax[0].plot(rise, dead, "o-", color=COL[g], label=f"centre of pressure {g}")
    for x, y, f in zip(rise, dead, FL):
        ax[0].annotate(f"{f:g} ms", (x, y), textcoords="offset points", xytext=(5, 4), fontsize=8, color=COL[g])
    ax[1].plot(FL, [m("step", g, s, "over") * 100 for s in SETS], "o-", color=COL[g], label=f"step overshoot, {g}")
    ax[1].plot(FL, [m("wind6", g, s, "peak") * 100 for s in SETS], "s--", color=COL[g], label=f"6 m/s wind-step drift, {g}")
ax[0].set_xlabel("rise time to 90% of a 1 m step at lever 1 (s)")
ax[0].set_ylabel("stress-test crashes, identified lags (of 1152)")
ax[0].set_title("what the slower tune buys, and what it costs", fontsize=9)
ax[1].set_xlabel("tuning floor (ms)")
ax[1].set_ylabel("cm")
ax[1].set_title("overshoot halves; wind drift grows by millimetres", fontsize=9)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
    a.legend(fontsize=7, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7y_response.png"), dpi=130)
print("wrote m7y_response.png")
