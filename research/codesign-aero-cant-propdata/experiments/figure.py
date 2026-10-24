"""Held-out RMS attitude error against the cant bound for each measured-data c (mean and per-seed range), and the cant angle chosen. Reads results.json; writes propdata.png."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
cols = dict(zip(R["cs"], ["#c0504d", "#2f6fb0", "#3a9a5b", "#8a5fb0"]))
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
for c, col in cols.items():
    rows = [t for t in R["table"] if t["k"] == c]
    caps = [t["cap"] for t in rows]
    lab = f"kappa = {c} D"
    a.errorbar(caps, [t["rms"] for t in rows], yerr=[[t["rms"] - min(t["rms_seeds"]) for t in rows], [max(t["rms_seeds"]) - t["rms"] for t in rows]], fmt="o-", color=col, capsize=3, label=lab)
    for t in rows:
        if t["cap"]:
            b.scatter([t["cap"] + 2 * list(cols).index(c) - 3] * len(t["alpha"]), t["alpha"], color=col, s=14)
a.set_xlabel("allowed cant bound (deg)"); a.set_ylabel("held-out RMS attitude error (deg)"); a.legend(fontsize=8); a.set_title("Joint co-design, 1920 evaluations, 5 seeds", fontsize=9)
b.set_xlabel("allowed cant bound (deg)"); b.set_ylabel("cant chosen by the optimiser (deg)"); b.set_ylim(0, 85); b.set_title("Chosen cant", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "propdata.png"), dpi=130)
