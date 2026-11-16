"""Figure for milestone 35: python experiments/m35_hose/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
MM = 1e-3

fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
ax = axes[0]
for j, n in enumerate(("g1", "h1")):
    for hose, ls in (("rubber", "-"), ("hybrid", "--")):
        rows = [x for x in R["B"] if x["robot"] == n and x["hose"] == hose]
        ax.plot([x["H"] for x in rows], [x["worst"]["10000.0"][0] for x in rows], "o" + ls, color=f"C{j}", ms=3,
                label=f"{n.upper()}, {hose} hose")
ax.axhline(0.5, color="0.5", ls=":", lw=1)
ax.set(xlabel="horizontal hose tension H (N), worst direction", ylabel="nose windup in the wall plane (mm)",
       title="Transmission windup at k_t 1e4 N m/rad (free nose)")
ax.legend(fontsize=7)

ax = axes[1]
for j, n in enumerate(("g1", "h1")):
    for hose, ls in (("rubber", "-"), ("hybrid", "--")):
        rows = [x for x in R["C"] if x["robot"] == n and x["hose"] == hose and "y" in x]
        ax.plot([x["H"] for x in rows], [abs(x["y"]) / MM for x in rows], "o" + ls, color=f"C{j}", ms=3,
                label=f"{n.upper()}, {hose} hose")
ax.axhline(0.3, color="0.5", ls=":", lw=1)
ax.set(xlabel="horizontal hose tension H (N), worst direction",
       ylabel="worst residual along the wall (mm)", title="Matched backlash compensator, hose unmodelled")
ax.legend(fontsize=7)

ax = axes[2]
for j, n in enumerate(("g1", "h1")):
    rows = [x for x in R["D"] if x["robot"] == n]
    ax.plot([x["H_max"] for x in rows], [100 * x["worst_loss"] for x in rows], "o-", color=f"C{j}", ms=4,
            label=f"{n.upper()}, rubber hose")
ax.axhline(2, color="0.5", ls=":", lw=1)
ax.set(yscale="log", xlabel="H uniform over [0, H_max] (N)", ylabel="stack points lost at the worst pose",
       title="12 bits, 5 arcmin, k_t 1e4: the hose unknown")
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
