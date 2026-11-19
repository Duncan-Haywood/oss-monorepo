"""Figure for milestone 54: python experiments/m54_lhs/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))

# left: sampled drag limit minus the grid's smaller neighbour, every pose, at the LHS directions
sh = D.get("shortfalls", [])
for robot, col in (("g1", "C0"), ("h1", "C1")):
    xs = [s["phi"] for s in sh if s["robot"] == robot]
    ys = [-s["shortfall"] for s in sh if s["robot"] == robot]
    ax1.scatter(xs, ys, s=8, color=col, alpha=0.6, label=robot.upper())
ax1.axhline(-0.5, color="C3", ls="--", lw=1)
ax1.text(3, -0.85, "H219 bound: 0.5 N below the grid", fontsize=7, color="C3")
ax1.axhline(0, color="0.5", lw=0.6)
for g in range(0, 361, 45):
    ax1.axvline(g, color="0.85", lw=0.6, zorder=0)
ax1.set_xlim(0, 360)
ax1.set_ylim(-3, 3)
ax1.set_xlabel("hose direction at the LHS sample (deg; grey: the 8 grid directions)")
ax1.set_ylabel("drag limit there minus the smaller grid neighbour (N, clipped)")
ax1.set_title("Is the 8-direction drag envelope safe between directions?", fontsize=10)
ax1.legend(fontsize=7, loc="upper right")

# right: the LHS loads, coloured by the worst in-envelope residual along the wall at that load
import matplotlib.colors as mcolors  # noqa: E402
norm = mcolors.LogNorm(vmin=0.003, vmax=0.3)
for robot, mk, dx in (("g1", "o", -2.5), ("h1", "s", 2.5)):
    xs, ys, cs = [], [], []
    for x in D["runs"]:
        if x["robot"] != robot:
            continue
        yy = [r["y"] for r in x["rows"] if r["in51"] and r["y"] is not None]
        if not yy:
            continue
        xs.append(x["phi"] + dx)
        ys.append(x["H"])
        cs.append(max(yy))
    sc = ax2.scatter(xs, ys, c=cs, cmap="magma_r", norm=norm, marker=mk, s=30, edgecolor="k", lw=0.3,
                     label=f"{robot.upper()} (worst |y| over its poses and sensor axes)")
    for x0, y0, c0 in zip(xs, ys, cs):
        if c0 > 0.03:
            ax2.annotate(f"{c0:.3f}", (x0, y0), textcoords="offset points", xytext=(5, 4), fontsize=7)
cb = fig.colorbar(sc, ax=ax2, label="worst in-envelope |y| at the load (mm; spec 0.03)")
cb.ax.axhline(0.03, color="C2", lw=2)
ax2.set_xlim(0, 360)
ax2.set_ylim(0, 20.5)
ax2.set_xlabel("hose direction (deg)")
ax2.set_ylabel("hose drag (N)")
ax2.set_title("48 Latin-hypercube hose loads: every in-envelope case plans", fontsize=10)
ax2.legend(fontsize=6, loc="upper left", bbox_to_anchor=(0, -0.13), ncol=2)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
