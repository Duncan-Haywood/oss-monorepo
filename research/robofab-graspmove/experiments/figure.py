"""Draw figure.png (MuJoCo minimum grip force vs analytic bound, per part) from the committed results.json only."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); rows = json.load(open(os.path.join(here, "results.json")))["rows"]
fig, ax = plt.subplots(figsize=(5.6, 4.6))
for part in sorted({x["part"] for x in rows}):
    pts = [x for x in rows if x["part"] == part and x["mujoco_N"] is not None]
    ax.scatter([x["bound_N"] for x in pts], [x["mujoco_N"] for x in pts], s=14, label=part)
lim = [0, max(x["bound_N"] for x in rows) * 1.05]
ax.plot(lim, lim, "k--", lw=1, label="MuJoCo = bound")
ax.set_xlabel("analytic bound (N)"); ax.set_ylabel("MuJoCo minimum grip force (N)")
ax.set_title("Grasp under acceleration: MuJoCo vs bound (%d settings)" % len(rows), fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "figure.png"), dpi=130)
