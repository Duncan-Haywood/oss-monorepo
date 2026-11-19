"""Milestone 7ab figure: what the training ceiling buys at the identified 39.1 ms floor. x = ceiling of the training lag range
(78.2 ms is 7u's lag39, 150 ms is 7aa's, 100 and 200 ms are 7ab's); the 75 ms tune (7z) is a dashed reference. Left: stress-test
crashes over the identified lags (of 1152). Middle: crashes at the 75 ms law (of 384). Right: rise time to 90% of a 1 m step at
the 36 ms law. Writes m7ab_ceilsweep.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
ID = ["id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0"]
LAW = "mid 36 ms D^0"
CEIL = [("aware lag39", 78.2), ("aware lag39c100", 100), ("aware lag39c150", 150), ("aware lag39c200", 200)]
COL = {"above": "#1f6fb2", "below": "#c0392b"}


def dead(g, s, laws):
    return sum(r["dead_45_2_cap"] for r in R["runs"] if r["set"] == s and r["geom"] == g and r["law_name"] in laws)


def rise(g, s):
    return float(np.median([np.nanmedian(np.where(np.asarray(r["rise"], float) == 0, np.inf, np.asarray(r["rise"], float)))
                            for r in R["resp"] if r["test"] == "step" and r["geom"] == g and r["set"] == s and r["law_name"] == LAW]))


panels = [(lambda g, s: dead(g, s, ID), "crashes, identified lags (of 1152)"),
          (lambda g, s: dead(g, s, ["stress 75 ms D^0"]), "crashes at the 75 ms law (of 384)"),
          (rise, "rise time to 90% of a 1 m step (s)")]
fig, ax = plt.subplots(1, 3, figsize=(12, 3.9))
for a, (f, lab) in zip(ax, panels):
    for g in ("above", "below"):
        a.plot([c for _, c in CEIL], [f(g, s) for s, _ in CEIL], "o-", color=COL[g], label=f"39.1 ms floor, centre of pressure {g}")
        a.axhline(f(g, "aware lag75"), ls="--", lw=1, color=COL[g], label=f"75 ms tune (7z), {g}")
    a.set_xlabel("training lag ceiling (ms)")
    a.set_ylabel(lab)
    a.set_xticks([78.2, 100, 150, 200])
    a.spines[["top", "right"]].set_visible(False)
ax[0].legend(fontsize=6.5, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7ab_ceilsweep.png"), dpi=130)
print("wrote m7ab_ceilsweep.png")
