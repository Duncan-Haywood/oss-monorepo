"""Plot accuracy vs modelled energy per inference from the committed results.txt.

Reads only experiments/results.txt (the sweep's own output); writes pareto.png.
Usage: python experiments/figure.py
"""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
ROW = re.compile(r"^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\|\s*[\d.]+\s+([\d.]+)\+-([\d.]+)\s*\|"
                 r".*\|\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$")
rows = []
for line in (here / "results.txt").read_text().splitlines():
    m = ROW.match(line)
    if m:
        seg, _, hid, bits, _, acc, sd, _, nj, _ = m.groups()
        rows.append((int(seg), int(hid), int(bits), float(acc), float(sd), float(nj)))
assert rows, "no rows parsed"

fig, ax = plt.subplots(figsize=(6.4, 4.2))
for bits, mk in ((2, "o"), (3, "s"), (4, "^"), (8, "D")):
    pts = [r for r in rows if r[2] == bits]
    ax.errorbar([p[5] for p in pts], [p[3] for p in pts], yerr=[p[4] for p in pts],
                fmt=mk, ms=5, capsize=2, lw=0.8, label=f"{bits}-bit weights")
ax.set_xscale("log")
ax.set_xlabel("modelled energy per inference (nJ, assumed 45 nm costs)")
ax.set_ylabel("test accuracy, 11 classes (mean ± sd, 3 seeds)")
ax.set_title("accel-kws: accuracy vs modelled energy (stylised)")
ax.grid(alpha=0.3)
ax.legend()
fig.tight_layout()
fig.savefig(here / "pareto.png", dpi=130)
print("rows", len(rows))
