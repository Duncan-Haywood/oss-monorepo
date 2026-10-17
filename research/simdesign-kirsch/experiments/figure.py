"""Plot peak-stress error against mesh size from the committed results.json.

Reads only experiments/results.json (the study's own output); writes errors.png.
Usage: python experiments/figure.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
rows = json.loads((here / "results.json").read_text())["rows"]
assert rows, "no rows"
h = [r["h_hole"] for r in rows]

fig, ax = plt.subplots(figsize=(6.4, 4.2))
ax.loglog(h, [abs(r["err_centroid_pct"]) for r in rows], "o-", label="centroid peak")
ax.loglog(h, [abs(r["err_vertex_pct"]) for r in rows], "s-", label="vertex peak (hole edge)")
ax.set_xlabel("element size at the hole, h/a")
ax.set_ylabel("|error| of peak von Mises stress vs exact 3σ (%)")
ax.set_title("simdesign-kirsch: peak-stress error vs mesh (stylised 2D)")
ax.grid(alpha=0.3, which="both")
ax.legend()
fig.tight_layout()
fig.savefig(here / "errors.png", dpi=130)
print("rows", len(rows))
