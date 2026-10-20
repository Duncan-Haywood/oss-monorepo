"""Draw gain_vs_noise.png from the committed results.txt: paired gain over random against the error in the cheap objectives, budget 30."""
import os
import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

D = os.path.dirname(os.path.abspath(__file__))
g = {}
sec = None
for l in open(os.path.join(D, "results.txt")):
    if l.startswith("## budget"):
        sec = int(l.split()[2].rstrip(":"))
    m = re.match(r"(\w+)\s+sigma\s+([\d.]+)\s+([+-][\d.]+) \[([+-][\d.]+), ([+-][\d.]+)\]", l)
    if m and sec == 30:
        g.setdefault(m[1], []).append((float(m[2]), float(m[3]), float(m[4]), float(m[5])))
fig, ax = plt.subplots(figsize=(7, 3.8))
for n, v in g.items():
    x = [r[0] for r in v]
    ax.errorbar(x, [r[1] for r in v], yerr=[[r[1] - r[2] for r in v], [r[3] - r[1] for r in v]], marker="o", ms=3, capsize=2, label=n)
ax.axhline(0, color="k", lw=0.8)
ax.set_xlabel("error sigma on each scaled objective (objective range = 1)"); ax.set_ylabel("hypervolume gain over random")
ax.legend(fontsize=8); ax.grid(alpha=.3)
ax.set_title("Budget 30, 100 paired seeds, 95% bootstrap CI: gain over random vs noise", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(D, "gain_vs_noise.png"), dpi=130)
