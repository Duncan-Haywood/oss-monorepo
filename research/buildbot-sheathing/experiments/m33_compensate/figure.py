"""Figure for milestone 33: python experiments/m33_compensate/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))


def rec(n, Rc, C, e, g):
    return [x for x in R["B"] if x["robot"] == n and x["R"] == Rc and x["C"] == C and x["extra"] == e
            and x["tau_g"] == g][0]


fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
COMP = ["none", "free", "force", "torque", "hold-min"]
for ax, Rc in zip(axes[:2], ("hold-min", "torque")):
    for j, C in enumerate(COMP):
        ys = [abs(rec("g1", Rc, C, e, 0.2)["worst_mu_y"]) * 1e3 for e in (0.0, 0.2, 0.4, 1.0)]
        ax.plot([0, 0.2, 0.4, 1.0], ys, "o-", color=f"C{j}", label=f"compensator assumes '{C}'")
    ax.axhline(0.3, color="0.5", ls=":", lw=1)
    ax.set(xlabel="tool mass the compensator does not know (kg)",
           ylabel="worst nail offset along the wall (mm)", ylim=(0, None),
           title=f"G1, robot balances with '{Rc}'; 15 leaned poses")
    ax.legend(fontsize=7)
ax = axes[2]
for j, C in enumerate(["free", "force", "torque", "hold-min"]):
    gs = [0.2, 0.5, 1.0, 2.0]
    ax.plot(gs, [abs(rec("g1", "hold-min", C, 0.0, g)["worst_mu_y"]) * 1e3 for g in gs], "o-", color=f"C{j + 1}",
            label=C)
ax.axhline(abs(rec("g1", "hold-min", "none", 0.0, 0.2)["worst_mu_y"]) * 1e3, color="C0", ls="--", lw=1,
           label="no compensation (one calibration)")
ax.set(xscale="log", xlabel="guard band: compensate only predicted |tau| >= (N m)", ylabel="worst offset (mm)",
       title="G1 on 'hold-min': a guard band only adds missed joints", ylim=(0, None))
ax.set_xticks([0.2, 0.5, 1.0, 2.0])
ax.set_xticklabels(["0.2 (none)", "0.5", "1", "2"])
ax.minorticks_off()
ax.legend(fontsize=7, title="compensator model", title_fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
