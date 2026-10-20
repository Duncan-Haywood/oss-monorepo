"""Draw figure.png (hand-written peak torque vs MuJoCo inverse dynamics) from the committed results.json only."""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
here = os.path.dirname(os.path.abspath(__file__)); rows = json.load(open(os.path.join(here, "results.json")))
fig, ax = plt.subplots(figsize=(5.6, 4.6))
for prof, m in (("trap", "o"), ("opt", "^")):
    pts = [x for x in rows if x["profile"] == prof]
    ax.scatter([x["peak_hand"] for x in pts], [x["peak_mujoco"] for x in pts], s=16, marker=m, label=prof)
ax.plot([0.2, 6], [0.2, 6], "k--", lw=1, label="equal")
ax.set_xscale("log"); ax.set_yscale("log")
from matplotlib.ticker import ScalarFormatter, NullFormatter
for a in (ax.xaxis, ax.yaxis): a.set_major_formatter(ScalarFormatter()); a.set_minor_formatter(NullFormatter())
ax.set_xticks([0.25, 0.5, 1, 2, 5]); ax.set_yticks([0.25, 0.5, 1, 2, 5])
ax.set_xlabel("hand-written peak torque (N m)"); ax.set_ylabel("MuJoCo inverse-dynamics peak torque (N m)")
ax.set_title("Peak joint torque: hand model vs MuJoCo (max diff %.1e N m)" % max(x["max_diff"] for x in rows), fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(here, "figure.png"), dpi=130)
