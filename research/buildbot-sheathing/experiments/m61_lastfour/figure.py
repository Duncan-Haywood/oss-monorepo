"""Figure for milestone 61: python experiments/m61_lastfour/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
phis = np.array([p for _, p in D["loads"]])
order = np.argsort(phis)
fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
for ax, n in zip(axes, ("g1", "h1")):
    gaps = []
    for k in D["limits"]:
        if f"'{n}'" not in k:
            continue
        a = np.array([np.nan if v is None else v for v in D["limits"][k]], float)
        b = np.array([np.nan if v is None else v for v in D["lp"][k]], float)
        gaps.append((a - b)[order])
    G = np.array(gaps)
    for i, g in enumerate(G):
        ax.scatter(phis[order], g, s=5, color="0.7", label="one pose" if i == 0 else None)
    ax.plot(phis[order], np.nanmedian(G, axis=0), color="C0", lw=1.4, label="median over poses")
    ax.plot(phis[order], np.nanmax(G, axis=0), color="C3", lw=1.0, label="largest over poses")
    esc = [(x, r) for x in D["runs"] if x["robot"] == n for r in x["rows"] if "esc" in r
           and r["esc"].get("Mu") is None and r["esc"].get("S") is None]
    if esc:
        ax.scatter([x["phi"] for x, _ in esc], [r["lim"] - (r["lp"] or 0.0) for _, r in esc], marker="x",
                   color="k", zorder=5, label="unplanned cases (their pose)")
    ax.set_xlabel("hose load direction (degrees)")
    ax.set_ylabel("balance limit minus planner limit L_p (N)")
    ax.set_title(f"{n.upper()}: balance gate vs the planner's own limit (seed {D['seed']})", fontsize=10)
    ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
