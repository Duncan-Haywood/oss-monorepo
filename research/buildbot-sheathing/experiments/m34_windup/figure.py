"""Figure for milestone 34: python experiments/m34_windup/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
ax = axes[0]
for j, n in enumerate(("g1", "h1")):
    for mode, ls in (("free", "-"), ("slip", "--")):
        c = R["C2"][n][mode]
        ax.plot(c["kt"], [100 * v for v in c["worst_loss"]], "o" + ls, color=f"C{j}", ms=3,
                label=f"{n.upper()}, nose {'free to slide' if mode == 'free' else 'held by friction, mu 0.4'}")
ax.axhline(2, color="0.5", ls=":", lw=1)
ax.set(xscale="log", xlabel="joint transmission stiffness k_t (N m/rad, every joint)",
       ylabel="stack points lost at the worst pose", title="The 25-50 N press window, 12 bits, 5 arcmin")
ax.legend(fontsize=7)

ax = axes[1]
for j, n in enumerate(("g1", "h1")):
    r = sorted(p["ratio"] for p in R["B"][n]["per_pose"])
    ax.plot(range(1, len(r) + 1), r, "o-", color=f"C{j}", ms=3, label=n.upper())
for mu in (0.2, 0.4, 0.8):
    ax.axhline(mu, color="0.5", ls=":", lw=1)
ax.set(yscale="log", xlabel="leaned poses, sorted", ylabel="friction coefficient needed to stick",
       title="Does the nose stick as the press grows?")
ax.legend(fontsize=7)

ax = axes[2]
for j, n in enumerate(("g1", "h1")):
    rows = [x for x in R["A"] if x["robot"] == n]
    ax.plot([x["kt"] for x in rows], [x["worst_free"][2] for x in rows], "o-", color=f"C{j}", ms=3,
            label=f"{n.upper()} nose, free")
    ax.plot([x["kt"] for x in rows], [x["worst_stuck"][3] for x in rows], "o--", color=f"C{j}", ms=3,
            label=f"{n.upper()} nail tip at 44.4 mm, stuck")
ax.set(xscale="log", yscale="log", xlabel="k_t (N m/rad)", ylabel="windup over the press window (mm)",
       title="Worst-pose windup, 25 to 50 N")
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=130)
