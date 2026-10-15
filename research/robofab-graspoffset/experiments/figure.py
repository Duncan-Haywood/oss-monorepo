"""Plot the minimum grasp force against centre-of-mass offset from the committed results.json.

Reads only experiments/results.json (the study's own output); writes force.png.
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
d = [r["d_mm"] for r in rows]

fig, ax = plt.subplots(figsize=(6.4, 4.2))
ax.plot(d, [r["ball_bound_N"] for r in rows], "-", color="C0", label="ball pads: bound")
ax.plot(d, [r["ball_mujoco_N"] for r in rows], "o", color="C0", label="ball pads: MuJoCo")
ax.fill_between(d, [r["flat_lower_N"] for r in rows], [r["flat_upper_N"] for r in rows],
                color="C1", alpha=0.3, label="flat pads: bound interval")
ax.plot(d, [r["flat_mujoco_N"] for r in rows], "s", color="C1", label="flat pads: MuJoCo")
ax.set_xlabel("centre-of-mass offset d (mm)")
ax.set_ylabel("minimum grip force per pad (N)")
ax.set_title("robofab-graspoffset: grip force vs offset (stylised)")
ax.grid(alpha=0.3)
ax.legend()
fig.tight_layout()
fig.savefig(here / "force.png", dpi=130)
print("rows", len(rows))
