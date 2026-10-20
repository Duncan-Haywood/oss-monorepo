"""Nominal J against mean J in shifted worlds for 600 random designs -> transfer.png (from results.json)."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, ax = plt.subplots(figsize=(5.6, 4.2))
ax.scatter(R["nom"], R["mean_shifted"], s=7, alpha=0.5, color="#1b9e77", label="600 random feasible designs")
lim = [0, 0.7]
ax.plot(lim, lim, color="#888888", lw=1, ls="--", label="no change")
ax.set_xlim(lim); ax.set_ylim(lim)
ax.set_xlabel("J in the nominal world")
ax.set_ylabel("mean J over 30 shifted worlds")
ax.set_title("Soft-fruit gripper: ranking transfers, level drops", fontsize=10)
ax.grid(alpha=0.3); ax.legend(fontsize=8, loc="upper left")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "transfer.png"), dpi=130)
print("wrote transfer.png")
