"""Plot the time-optimal edge over the grid-tuned and refined trapezoid from the committed results.json.

Reads only experiments/results.json (the study's own output); writes edge.png.
Usage: python experiments/figure.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
rows = json.loads((here / "results.json").read_text())
assert rows, "no rows"
labels = [f"{r['L']:g} m, k={'none' if r['k'] is None else int(r['k'])}, {r['wmax']:g} rad/s" for r in rows]
x = range(len(rows))

fig, ax = plt.subplots(figsize=(7.4, 4.4))
ax.bar([i - 0.2 for i in x], [r["edge_grid"] for r in rows], 0.4, label="over grid-tuned trapezoid")
ax.bar([i + 0.2 for i in x], [r["edge_ref"] for r in rows], 0.4, label="over refined trapezoid")
ax.set_xticks(list(x))
ax.set_xticklabels(labels, rotation=60, ha="right", fontsize=7)
ax.set_ylabel("time-optimal edge (% of total time)")
ax.set_title("robofab-rampopt: edge of the time-optimal carry (stylised)")
ax.grid(alpha=0.3, axis="y")
ax.legend()
fig.tight_layout()
fig.savefig(here / "edge.png", dpi=130)
print("rows", len(rows))
