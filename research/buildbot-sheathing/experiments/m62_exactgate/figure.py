"""Figure for milestone 62: python experiments/m62_exactgate/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
phis = np.array([p for _, p in D["loads"]])
fig, axes = plt.subplots(1, 2, figsize=(11, 4.4), sharey=False)
for ax, n in zip(axes, ("g1", "h1")):
    gp, ga = [], []
    for k in D["limits"]:
        if f"'{n}'" not in k:
            continue
        for p, a, b, x in zip(phis, D["limits"][k], D["lp"][k], D["lany"][k]):
            if a is None:
                continue
            if b is not None:
                gp.append((p, a - b))
            if x is not None and x["L"] is not None:
                ga.append((p, a - x["L"]))
    gp, ga = np.array(gp), np.array(ga)
    ax.scatter(gp[:, 0], gp[:, 1], s=7, color="0.65", label="pose's own hold sides (L_p)")
    ax.scatter(ga[:, 0], ga[:, 1], s=9, color="C3", label="best of every hold-side combination (L_any)")
    ax.axhline(D["band"], color="k", lw=0.7, ls="--", label=f"{D['band']:g} N band")
    ax.set_xlabel("hose load direction (degrees)")
    ax.set_ylabel("balance limit minus planner limit (N)")
    ax.set_title(f"{n.upper()}: how far the balance gate overshoots the planner (seed {D['seed']})", fontsize=10)
    ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
