"""Draw rank_agreement.png from the committed results.txt (never retyped numbers)."""
import re
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
rows = {}
for line in (here / "results.txt").read_text().splitlines():
    p = [x.strip() for x in line.split("|")]
    if len(p) == 6 and p[0] in ("euler", "timoshenko", "fe2d"):
        rows[p[0]] = [[float(v) for v in re.split(r",\s*", c)] for c in (p[1], p[4], p[5])]
names = ["All designs", "Stubby (L/h<6)", "Wide (b/h>2)"]
fig, ax = plt.subplots(figsize=(7, 3.6))
for i, (m, c) in enumerate(zip(rows, ["#c0392b", "#1f6fb2", "#2e8b57"])):
    for j in range(3):
        ax.scatter([j + (i - 1) * 0.2] * 3, rows[m][j], color=c, s=28, label=m if j == 0 else None)
ax.set_xticks(range(3)); ax.set_xticklabels(names)
ax.set_ylabel("Kendall tau vs 3D FE (3 seeds)"); ax.set_ylim(0.94, 1.002)
ax.set_title("Ranking 80 cantilever designs by stiffness per mass"); ax.legend(loc="lower right")
fig.tight_layout(); fig.savefig(here / "rank_agreement.png", dpi=110)
