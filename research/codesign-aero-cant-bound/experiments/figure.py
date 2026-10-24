"""Held-out RMS attitude error of the jointly co-designed quadrotor against the cant bound, for tilt loss k = 0 and 0.2 (mean and per-seed range of 5 seeds), and the chosen cant angles. Reads results.json; writes bound.png."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
for k, c in ((0.0, "#2f6fb0"), (0.2, "#c0504d")):
    rows = [t for t in R["table"] if t["k"] == k]
    caps = [t["cap"] for t in rows]
    a.errorbar(caps, [t["rms"] for t in rows], yerr=[[t["rms"] - min(t["rms_seeds"]) for t in rows], [max(t["rms_seeds"]) - t["rms"] for t in rows]], fmt="o-", color=c, capsize=3, label=f"tilt loss k={k}")
    for t in rows:
        if t["cap"]:
            b.scatter([t["cap"] + (1.5 if k else -1.5)] * len(t["alpha"]), t["alpha"], color=c, s=14)
a.set_xlabel("allowed cant bound (deg)"); a.set_ylabel("held-out RMS attitude error (deg)"); a.legend(fontsize=8); a.set_title("Joint co-design, 1920 evaluations, 5 seeds", fontsize=9)
b.plot([30, 85], [30, 85], "k:", lw=0.8); b.set_xlabel("allowed cant bound (deg)"); b.set_ylabel("cant chosen by the optimiser (deg)"); b.set_ylim(0, 85)
b.set_title("Chosen cant: interior optimum near 35 deg, not the bound", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "bound.png"), dpi=130)
