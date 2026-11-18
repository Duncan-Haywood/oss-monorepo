"""Milestone 7aa figure. Left: the tuning-floor frontier of 7z (stress-test crashes over the identified lags, of 1152, against
rise time to 90% of a 1 m step at lever 1, 36 ms law; floors 39.1-75 ms, training lag floor x U(1, 2)) with the new design set
(floor 39.1 ms, ceiling 150 ms) as a star. Right: L2-45 crashes (of 384) against the flown lag law, 33 to 75 ms, for the 39.1 ms
tune, the wide tune and the 75 ms tune. Writes m7aa_ceiling.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
A = json.load(open(os.path.join(HERE, "results.json")))
Z = json.load(open(os.path.join(HERE, "..", "m7z_floor75", "results.json")))
X = json.load(open(os.path.join(HERE, "..", "m7x_knee", "results.json")))["runs"]
Y = json.load(open(os.path.join(HERE, "..", "m7y_response", "results.json")))["runs"]
ID = ["id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0"]
LAW = "mid 36 ms D^0"
FLOORS = [("aware lag39", 39.1, X, Y), ("aware lag45", 45, Z["runs"], Y), ("aware lag52", 52, Z["runs"], Y),
          ("aware lag60", 60, Z["runs"], Z["resp"]), ("aware lag75", 75, Z["runs"], Z["resp"])]
COL = {"above": "#1f6fb2", "below": "#c0392b"}
LAWS = [("id 33 ms D^0", 33), ("mid 36 ms D^0", 36), ("id 39.1 ms D^0", 39.1), ("stress 45 ms D^0", 45),
        ("stress 52 ms D^0", 52), ("stress 60 ms D^0", 60), ("stress 75 ms D^0", 75)]


def rise(src, g, s):
    return float(np.median([np.nanmedian(np.where(np.asarray(r["rise"], float) == 0, np.inf, np.asarray(r["rise"], float)))
                            for r in src if r["test"] == "step" and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]))


def dead(src, g, s, laws):
    return sum(r["dead_45_2_cap"] for r in src if r["set"] == s and r["geom"] == g and r["law_name"] in laws)


fig, ax = plt.subplots(1, 2, figsize=(10.5, 4.3))
for g in ("above", "below"):
    rs = [rise(ysrc, g, s) for s, _, _, ysrc in FLOORS]
    dd = [dead(xsrc, g, s, ID) for s, _, xsrc, _ in FLOORS]
    ax[0].plot(rs, dd, "o-", color=COL[g], label=f"floor x U(1, 2), centre of pressure {g}")
    for x, y, (_, f, _, _) in zip(rs, dd, FLOORS):
        ax[0].annotate(f"{f:g}", (x, y), textcoords="offset points", xytext=(5, 4), fontsize=8, color=COL[g])
    ax[0].plot([rise(A["resp"], g, "aware lag39c150")], [dead(A["runs"], g, "aware lag39c150", ID)], "*", ms=14, color=COL[g],
               markeredgecolor="k", label=f"39.1 ms floor, 150 ms ceiling, {g}")
    for s, ls in (("aware lag39", ":"), ("aware lag39c150", "-"), ("aware lag75", "--")):
        ax[1].plot([l for _, l in LAWS], [dead(A["runs"], g, s, [n]) for n, _ in LAWS], ls, marker="o", ms=3, color=COL[g],
                   label=f"{s.split()[1]}, {g}")
ax[0].set_xlabel("rise time to 90% of a 1 m step at lever 1 (s)")
ax[0].set_ylabel("stress-test crashes, identified lags (of 1152)")
ax[0].set_title("frontier (points labelled by floor, ms) and the wide tune", fontsize=9)
ax[1].axvspan(33, 39.1, color="#ddd", lw=0)
ax[1].set_xlabel("flown motor lag law (ms; shaded: identified)")
ax[1].set_ylabel("stress-test crashes at lever 2, 45 deg (of 384)")
ax[1].set_title("where each tune crashes", fontsize=9)
for a in ax:
    a.spines[["top", "right"]].set_visible(False)
    a.legend(fontsize=6.5, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7aa_ceiling.png"), dpi=130)
print("wrote m7aa_ceiling.png")
