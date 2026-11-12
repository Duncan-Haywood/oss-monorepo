"""Figure for milestone 1: held-out RMS attitude error per arm, earlier actuator model against the full allocation (one dot per seed)."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, axes = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
colors = {"prior": "#8a8a8a", "hover": "#1f6fb2", "free": "#d9822b"}
for ax, twr, title in ((axes[0], "2", "TWR fixed at 2"), (axes[1], "free6", "TWR free in 1.5-6")):
    acts = [a for a in ("prior", "hover", "free") if any(r["twr_arm"] == twr and r["act"] == a for r in R["table"])]
    for j, act in enumerate(acts):
        for i, cap in enumerate((0, 35, 80)):
            row = next(r for r in R["table"] if (r["cap"], r["twr_arm"], r["act"]) == (cap, twr, act))
            x = i + (j - (len(acts) - 1) / 2) * 0.25
            ax.bar(x, row["rms"], width=0.23, color=colors[act], alpha=0.35, label=act if i == 0 else None)
            ax.scatter([x] * len(row["rms_seeds"]), row["rms_seeds"], s=12, color=colors[act], zorder=3)
    ax.set_xticks(range(3)); ax.set_xticklabels(["no cant", "cant <= 35°", "cant <= 80°"])
    ax.set_title(title); ax.grid(axis="y", alpha=0.3)
axes[0].set_ylabel("held-out RMS attitude error (deg)")
axes[1].legend(title="actuator model", frameon=False)
fig.suptitle(f"Co-designed quadrotor, c = {R['c']} (UIUC median); prior = earlier projects' torque limits", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m1_allocation.png"), dpi=130)
print("wrote m1_allocation.png")
