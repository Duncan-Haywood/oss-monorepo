"""Plot final/mapped area and place/netlist period ratios from the committed results.txt.

Reads only experiments/results.txt; writes ratios.png. Usage: python experiments/figure.py
"""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
text = (here / "results.txt").read_text().split("TIMING")
area, timing = {}, {}
for line in text[0].splitlines():
    p = line.split()
    if len(p) == 8 and re.fullmatch(r"[\d.]+", p[6]):
        area[p[0]] = float(p[6])
for line in text[1].splitlines():
    p = line.split()
    if len(p) == 6 and re.fullmatch(r"[\d.]+", p[5]):
        timing[p[0]] = float(p[5])
names = [n for n in area if n in timing]
assert names, "no rows parsed"

fig, axes = plt.subplots(1, 2, figsize=(9, 4.2), sharey=True)
for ax, data, title in ((axes[0], area, "final / mapped area"),
                        (axes[1], timing, "post-place / netlist implied period")):
    ax.barh(range(len(names)), [data[n] for n in names], color="#4c78a8")
    ax.axvline(1.0, color="k", lw=0.8)
    ax.set_title(title)
    ax.grid(axis="x", alpha=0.3)
axes[0].set_yticks(range(len(names)))
axes[0].set_yticklabels(names, fontsize=7)
axes[0].invert_yaxis()
fig.suptitle("chip-pnr: place-and-route overhead on small designs (stylised)", fontsize=10)
fig.tight_layout()
fig.savefig(here / "ratios.png", dpi=130)
print("designs", len(names))
