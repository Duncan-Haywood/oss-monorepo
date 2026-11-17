"""Figure for milestone 40: python experiments/m40_liftoff/figure.py (reads results.json)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))

fig, axes = plt.subplots(1, 2, figsize=(12, 4.4))
ax = axes[0]
for j, n in enumerate(("g1", "h1")):
    pts = {}
    for k, v in R["F_bal"].items():
        rob, z, dy = k.split()
        if rob == n:
            pts.setdefault(float(z), []).append(v)
    zs = sorted(pts)
    ax.plot(zs, [max(pts[z]) for z in zs], marker="o", ms=4, color=f"C{j}", label=f"{n.upper()}")
ax.axhspan(25, 50, color="0.85", label="press window at firing (25-50 N)")
ax.set_xlabel("hand height of the leaned pose (m)")
ax.set_ylabel("lowest press the stance balances (N)")
ax.set_title("Below this the leaned stance tips towards the wall\n(recoil bracket 0.09-8.7 N s lifts the nose)",
             fontsize=10)
ax.legend(fontsize=8)

ax = axes[1]
rows = [r for x in R["A"] if x["fr"] == 0.0 for r in x["rows"] if r["below"] and r["tau_path"]]
for i, r in enumerate(rows):
    peak = max(abs(t) for t in r["tau_path"])
    win = max(abs(t) for t in r["tau_window"])
    ax.plot([i, i], [win, peak], color="C0", lw=2)
    ax.plot([i], [peak], "o", color="C0", ms=4)
ax.axhline(R["tau_f"], color="C3", ls="--", label=f"holding threshold tau_f {R['tau_f']:g} N m")
ax.set_xticks(range(len(rows)), [f"{r['joint'].replace('_joint', '')}\nz {r['pose'][0]:g}" for r in rows],
              fontsize=6, rotation=60)
ax.set_ylabel("|tau| (N m): window (line foot) to peak on the rise (dot)")
ax.set_title("Loose nose-moving joints never reach tau_f on the re-press", fontsize=10)
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "figure.png"), dpi=110)
print("wrote figure.png")
