"""Build (or load) the 80-design table, then compare six proposers at equal budgets. Run: PYTHONPATH=src python experiments/run.py
Writes experiments/table.jsonl (first run only), results.txt, hv_curves.png."""
import os
import numpy as np
from eda_proposers import bench, hv, proposers, table

D = os.path.dirname(os.path.abspath(__file__))
TAB = os.path.join(D, "table.jsonl")
if not os.path.exists(TAB):
    table.build_table(TAB)
rows = table.load_table(TAB)
sp = table.Space(rows)
BUD, SEEDS = [4, 8, 12, 16, 20, 30, 40], 100
res = bench.compare(sp, BUD, SEEDS)
true_front = hv.nondominated([sp.evaluate(x) for x in sp.all()])
L = [f"# {rows[0]['yosys']} (gates), {rows[1]['yosys']} (fast); 80 designs = p 1..8 x wb 4..8 x abc {{gates, fast}}",
     f"# objectives (all minimised): cells, cycles, 1-accuracy; normalised to [0,1] over the table; hypervolume reference (1.1,1.1,1.1)",
     f"# true Pareto front: {len(true_front)} of 80 designs; metric = hypervolume of found front / hypervolume of true front",
     f"# {SEEDS} seeds per stochastic proposer (grid is deterministic: 1 run); mean [95% bootstrap interval]", "",
     "budget  " + "  ".join(f"{n:>22s}" for n in res)]
for j, b in enumerate(BUD):
    cells = []
    for n, a in res.items():
        m, lo, hi = bench.ci95(a[:, j])
        cells.append(f"{m:.3f}" + (f" [{lo:.3f},{hi:.3f}]" if lo is not None else "                ") )
    L.append(f"{b:6d}  " + "  ".join(f"{c:>22s}" for c in cells))
# paired comparison at budget 16 against random, same seeds
j = BUD.index(16)
L += ["", "difference from random at budget 16 (paired by seed index), mean and fraction of seeds where the proposer is strictly better:"]
for n, a in res.items():
    if n in ("random", "grid"):
        continue
    d = a[:, j] - res["random"][:, j]
    L.append(f"  {n:10s} {d.mean():+.3f}  better in {np.mean(d > 0):.2f} of seeds, worse in {np.mean(d < 0):.2f}")
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for n, a in res.items():
    ax.plot(BUD, a.mean(0), marker="o", ms=3, label=n)
ax.set_xlabel("distinct designs evaluated"); ax.set_ylabel("hypervolume / true-front hypervolume")
ax.set_title("Proposers at equal budgets (80-design space, 100 seeds)", fontsize=10); ax.legend(fontsize=8); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(D, "hv_curves.png"), dpi=130)
