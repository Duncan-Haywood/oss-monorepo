"""Figure for milestone 6b: side-force cost against the centre-of-pressure lever (left), late-window position error on the axis
the side force hurts and the one it helps (middle), and cant minus no cant in the composite (right). Reads results.json."""
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
runs, LEV = d["runs"], d["levers"]
COL = {"above": "#1f77b4", "below": "#d62728"}
NAME = {"above": "centre of pressure above CoM", "below": "centre of pressure below CoM"}
HURT = {"above": ("latey", "latex"), "below": ("latex", "latey")}


def sel(g, a, src="retrained"):
    return sorted((r for r in runs if r["geom"] == g and r["arm"] == a and r["source"] == src), key=lambda r: r["seed"])


fig, ax = plt.subplots(1, 3, figsize=(13, 4))
rng = np.random.default_rng(0)
for k, g in enumerate(("above", "below")):
    rs = sel(g, "aware")
    off = (k - 0.5) * 0.06
    y = np.array([[r[f"pos_{l:g}_on"] / r[f"pos_{l:g}_off"] for l in LEV] for r in rs])
    for row in y:
        ax[0].scatter(np.array(LEV) + off + rng.uniform(-0.02, 0.02, len(LEV)), row, s=10, color=COL[g], alpha=0.5)
    ax[0].plot(np.array(LEV) + off, y.mean(0), "-o", color=COL[g], label=NAME[g])
    hu, he = HURT[g]
    for j, (key, mk) in enumerate(((hu, "o"), (he, "s"))):
        v = np.array([r[f"{key}_1_on"] for r in rs]); x = k + (j - 0.5) * 0.3
        ax[1].scatter(x + rng.uniform(-0.04, 0.04, len(v)), v, s=18, color=COL[g], marker=mk, alpha=0.85 if j == 0 else 0.4)
        ax[1].hlines(np.median(v), x - 0.1, x + 0.1, color="k", lw=1.5)
    z = sel(g, "nocant")
    dj = np.array([[a[f"J_{l:g}_on"] - b[f"J_{l:g}_on"] for l in LEV] for a, b in zip(rs, z)])
    for row in dj:
        ax[2].scatter(np.array(LEV) + off + rng.uniform(-0.02, 0.02, len(LEV)), row, s=10, color=COL[g], alpha=0.5)
    ax[2].plot(np.array(LEV) + off, dj.mean(0), "-o", color=COL[g], label=NAME[g])
ax[0].axhline(1.0, color="k", lw=0.6); ax[0].axhline(1.2, color="k", lw=0.8, ls="--")
ax[0].set_xlabel("centre-of-pressure lever (× inherited 0.05 + 0.3 L)"); ax[0].set_ylabel("position RMS, side force on / off")
ax[0].set_title("Cost of the side force (retrained, force-aware)"); ax[0].legend(frameon=False, fontsize=8)
ax[1].set_xticks([-0.15, 0.15, 0.85, 1.15]); ax[1].set_xticklabels(["above:\nhurt (y)", "above:\nhelped (x)", "below:\nhurt (x)", "below:\nhelped (y)"])
ax[1].set_ylabel("late-window (3–6 s) position RMS per axis (m)"); ax[1].set_title("One axis hurt, one helped (lever 1)")
ax[2].axhline(0.0, color="k", lw=0.6); ax[2].set_xlabel("centre-of-pressure lever (× inherited)")
ax[2].set_ylabel("J, cant minus no cant (above 0: cant better)"); ax[2].set_title("Does cant still pay? (paired by seed)")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m6b_cop.png"), dpi=150)
print("wrote m6b_cop.png")
