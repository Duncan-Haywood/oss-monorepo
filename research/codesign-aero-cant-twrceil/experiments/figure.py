"""Held-out RMS attitude error against the TWR ceiling (4, 6, 8), with and without cant, at each measured c, per-seed points. Reads results.json; writes twr_ceiling.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, axs = plt.subplots(1, len(R["cs"]), figsize=(9, 3.4), sharey=True)
for a, c in zip(axs, R["cs"]):
    for cap, col, lab in ((0, "#c0504d", "no cant"), (35, "#2f6fb0", "cant to 35°")):
        rows = sorted([t for t in R["table"] if t["k"] == c and t["cap"] == cap], key=lambda t: t["ceil"])
        for t in rows:
            a.scatter([t["ceil"]] * len(t["rms_seeds"]), t["rms_seeds"], color=col, s=12, alpha=.6)
        a.plot([t["ceil"] for t in rows], [t["rms"] for t in rows], color=col, label=lab)
    a.set_title(f"c = {c}", fontsize=9); a.set_xlabel("TWR ceiling"); a.set_xticks([4, 6, 8])
axs[0].set_ylabel("held-out RMS attitude error (deg)"); axs[0].legend(fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "twr_ceiling.png"), dpi=130)
