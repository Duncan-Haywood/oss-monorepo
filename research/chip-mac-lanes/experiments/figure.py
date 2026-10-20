"""Write experiments/lanes.png: cells x cycles against MAC-lane count P, for F = 16 and 32, from the committed results.txt only.

    python experiments/figure.py     (needs matplotlib)
"""
import re
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
ROW = re.compile(r"^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(True|False)\s*$")
data = {}
for line in (HERE / "results.txt").read_text().splitlines():
    m = ROW.match(line)
    if m:
        data.setdefault(int(m[1]), []).append((int(m[2]), int(m[6])))
fig, ax = plt.subplots(figsize=(7, 3.8))
for f, c in sorted(data.items()):
    ps, ms = zip(*c)
    ax.plot(ps, ms, marker="o", ms=4, label=f"F = {f}")
    b = min(c, key=lambda t: t[1])
    ax.annotate(f"P={b[0]}", b, textcoords="offset points", xytext=(0, -14), ha="center", fontsize=8)
ax.set_yscale("log")
ax.set_xticks(range(1, 21, 1))
ax.tick_params(labelsize=7)
ax.set_xlabel("MAC lanes P (hidden width H = 16)")
ax.set_ylabel("generic cells x cycles (lower is better)")
ax.set_title("Powers of two sit on the lower envelope", fontsize=10)
ax.legend()
fig.tight_layout()
fig.savefig(HERE / "lanes.png", dpi=130)
