"""Draw gain_by_view.png from results.txt: paired gain over random (budget 20) when searching each view, scored on SKY130 truth."""
import os
import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

D = os.path.dirname(os.path.abspath(__file__))
g, sec = {}, None
for l in open(os.path.join(D, "results.txt")):
    if l.startswith("## budget"):
        sec = (int(l.split()[2].rstrip(":")), "paired gain" in l)
    m = re.match(r"(\w[\w.]*)\s+(annealing|genetic|nsga2|tpe)\s+([+-][\d.]+) \[([+-][\d.]+), ([+-][\d.]+)\]", l)
    if m and sec == (20, True):
        g.setdefault(m[2], {})[m[1]] = tuple(float(m[i]) for i in (3, 4, 5))
views = ["true", "cells", "cells_dep", "noisy0.079", "noisy0.2"]
fig, ax = plt.subplots(figsize=(7.5, 3.8))
w = 0.8 / len(views)
for j, v in enumerate(views):
    xs = [i + j * w for i in range(len(g))]
    vals = [g[p][v] for p in g]
    ax.bar(xs, [a[0] for a in vals], w, yerr=[[a[0] - a[1] for a in vals], [a[2] - a[0] for a in vals]], capsize=2, label=v)
ax.set_xticks([i + 0.4 - w / 2 for i in range(len(g))]); ax.set_xticklabels(list(g))
ax.axhline(0, color="k", lw=0.8); ax.set_ylabel("hypervolume gain over random")
ax.legend(fontsize=7, ncol=3); ax.grid(alpha=.3, axis="y")
ax.set_title("Budget 20 of 40, 200 paired seeds, 95% bootstrap CI: searched view vs gain (scored on SKY130)", fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(D, "gain_by_view.png"), dpi=130)
