"""Milestone 7z figure: the tuning-floor frontier with its fifth point. Left: lever-2 stress-test crashes over the identified
lags (33 + 36 + 39.1 ms, of 1152 per set and geometry) against rise time to 90% of a 1 m step at lever 1 (36 ms law), one
point per floor (39.1, 45, 52 ms from 7x and 7y; 60 and 75 ms from this milestone). Right: crashes avoided per extra 0.1 s of
rise time, per step between neighbouring floors. Writes m7z_floor75.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
Z = json.load(open(os.path.join(HERE, "results.json")))
X = json.load(open(os.path.join(HERE, "..", "m7x_knee", "results.json")))["runs"]
Y = json.load(open(os.path.join(HERE, "..", "m7y_response", "results.json")))["runs"]
ID = ["id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0"]
LAW = "mid 36 ms D^0"
FLOORS = [("aware lag39", 39.1, X, Y), ("aware lag45", 45, Z["runs"], Y), ("aware lag52", 52, Z["runs"], Y),
          ("aware lag60", 60, Z["runs"], Z["resp"]), ("aware lag75", 75, Z["runs"], Z["resp"])]
COL = {"above": "#1f6fb2", "below": "#c0392b"}


def rise(src, g, s):
    return float(np.median([np.nanmedian(np.where(np.asarray(r["rise"], float) == 0, np.inf, np.asarray(r["rise"], float))) for r in src if r["test"] == "step" and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]))


fig, ax = plt.subplots(1, 2, figsize=(10.5, 4.3))
for k, g in enumerate(("above", "below")):
    rs = [rise(ysrc, g, s) for s, _, _, ysrc in FLOORS]
    dead = [sum(r["dead_45_2_cap"] for r in xsrc if r["set"] == s and r["geom"] == g and r["law_name"] in ID) for s, _, xsrc, _ in FLOORS]
    ax[0].plot(rs, dead, "o-", color=COL[g], label=f"centre of pressure {g}")
    for x, y, (_, f, _, _) in zip(rs, dead, FLOORS):
        ax[0].annotate(f"{f:g} ms", (x, y), textcoords="offset points", xytext=(5, 4), fontsize=8, color=COL[g])
    rate = [(dead[i] - dead[i + 1]) / max((rs[i + 1] - rs[i]) * 10, 1e-9) for i in range(len(rs) - 1)]
    lab = [f"{FLOORS[i][1]:g}-{FLOORS[i + 1][1]:g}" for i in range(len(rs) - 1)]
    ax[1].bar(np.arange(len(rate)) + (k - 0.5) * 0.38, rate, 0.38, color=COL[g], label=f"centre of pressure {g}")
    ax[1].set_xticks(np.arange(len(rate)), lab, fontsize=8)
ax[0].set_xlabel("rise time to 90% of a 1 m step at lever 1 (s)")
ax[0].set_ylabel("stress-test crashes, identified lags (of 1152)")
ax[0].set_title("the tuning-floor frontier, 39.1 to 75 ms", fontsize=9)
ax[1].axhline(0, color="#888", lw=0.8)
ax[1].set_xlabel("step between tuning floors (ms)")
ax[1].set_ylabel("crashes avoided per extra 0.1 s of rise")
ax[1].set_title("what each step slower buys per unit of rise time", fontsize=9)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
    a.legend(fontsize=7, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7z_floor75.png"), dpi=130)
print("wrote m7z_floor75.png")
