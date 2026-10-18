"""Draw gate-open fraction's effect: recall vs battery hours per room, from the committed results.txt."""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
rows = {"thr": [], "k": []}
for line in (here / "results.txt").read_text().splitlines():
    m = re.match(r"(thr|k)\s+(-?\d+):\s+(.*)", line)
    if m:
        cells = re.findall(r"\[(-?\d+)\] ([\d.]+)/([\d.]+)/([\d.]+)/\s*([\d.]+)h", m.group(3))
        rows[m.group(1)].append({int(r): (float(rec), float(h)) for r, rec, _, _, h in cells})

fig, axes = plt.subplots(1, 4, figsize=(13, 3.2), sharey=True)
for ax, room in zip(axes, [-60, -50, -40, -30]):
    for key, style, label in [("thr", "o--", "fixed threshold"), ("k", "s-", "adaptive (k x floor)")]:
        pts = sorted((r[room][1], r[room][0]) for r in rows[key])
        ax.plot([p[0] for p in pts], [p[1] for p in pts], style, label=label, ms=4)
    ax.set_title(f"background {room} dBFS")
    ax.set_xlabel("battery hours (model)")
    ax.grid(alpha=.3)
axes[0].set_ylabel("recall of speech frames")
axes[0].legend(fontsize=8, loc="lower left")
fig.suptitle("Synthetic audio, stylised power model: recall vs battery life as the gate threshold moves", fontsize=10)
fig.tight_layout()
fig.savefig(here / "gate_tradeoff.png", dpi=110)
