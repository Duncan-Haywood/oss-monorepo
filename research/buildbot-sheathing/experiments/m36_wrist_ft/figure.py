"""Figure for milestone 36: python experiments/m36_wrist_ft/figure.py (reads results.json)."""
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
    rows = [x for x in R["A"] if x["robot"] == n]
    H = [x["H"] for x in rows]
    ax.plot(H, [abs(x["none"]["y"]) / MM for x in rows], "o-", color=f"C{j}", ms=3, label=f"{n.upper()}, no sensor")
    ax.plot(H, [abs(x["0.2"]["y"]) / MM for x in rows], "s--", color=f"C{j}", ms=3, label=f"{n.upper()}, FT 300 (0.2 N)")
    ax.plot(H, [abs(x["2.4"]["y"]) / MM for x in rows], "^:", color=f"C{j}", ms=3,
            label=f"{n.upper()}, pre-2017 FT 300 (2.4 N)")
ax.axhline(0.3, color="0.5", ls=":", lw=1)
ax.set(xlabel="horizontal hose tension H (N), worst direction", ylabel="worst residual along the wall (mm)",
       title="Compensator fed by a wrist F/T sensor")
ax.legend(fontsize=6)

ax = axes[1]
rows = R["A2"]["rows"]
ax.plot([x["b"] for x in rows], [abs(x["y"]) / MM for x in rows], "o-", color="C0", ms=4, label="G1, H 5 N")
ax.axhline(0.3, color="0.5", ls=":", lw=1)
ax.set(xscale="log", xlabel="sensor error |e| (N), worst signed axis", ylabel="worst residual along the wall (mm)",
       title="The floor: held joints at the friction threshold")
ax.legend(fontsize=7)

ax = axes[2]
cases = [c for c in dict.fromkeys(x["case"] for x in R["C"])]
for k, case in enumerate(cases):
    rows = [x for x in R["C"] if x["robot"] == "g1" and x["case"] == case]
    ax.plot([x["H_max"] for x in rows], [max(100 * x["worst_loss"], 1e-2) for x in rows], "o-", color=f"C{k}",
            ms=3, label=case)
ax.axhline(2, color="0.5", ls=":", lw=1)
ax.set(yscale="log", xlabel="H uniform over [0, H_max] (N)", ylabel="G1 stack points lost, worst pose (floor 0.01)",
       title="12 bits, 5 arcmin, k_t 1e4")
ax.legend(fontsize=6)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
