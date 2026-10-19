"""Screen vs random vs TPE at equal numbers of syntheses. Run: PYTHONPATH=src python experiments/run.py  (about a minute)
Writes results.txt."""
import os
import numpy as np
from eda_cheapaware import bench, hv
from eda_cheapaware.space import Space, load_table

D = os.path.dirname(os.path.abspath(__file__))
rows = load_table(os.path.join(D, "table.jsonl"))
sp = Space(rows)
BUD, SEEDS = [4, 6, 8, 10, 12, 16, 20, 30], 100
NAMES = ["random", "tpe", "cheaprandom", "screen4", "screen6", "screen8", "cheaponly", "oracle"]
res = {n: np.array([bench.curve(sp, bench.run_once(sp, n, max(BUD), s), BUD) for s in range(SEEDS)]) for n in NAMES}
true_front = hv.nondominated([sp.evaluate(x) for x in sp.all()])
L = [f"# 80-design table from eda-proposers ({rows[0]['yosys']}); objectives cells, cycles, 1-accuracy; true front {len(true_front)} of 80",
     "# budget = number of Yosys syntheses (distinct designs whose cell count is measured). The screen also reads cycles and error for all 80 designs for free.",
     f"# metric: hypervolume found / true; {SEEDS} seeds; mean [95% bootstrap interval]", "",
     "budget  " + "  ".join(f"{n:>20s}" for n in NAMES)]
for j, b in enumerate(BUD):
    cells = []
    for n in NAMES:
        m, lo, hi = bench.ci95(res[n][:, j])
        cells.append(f"{m:.3f} [{lo:.3f},{hi:.3f}]")
    L.append(f"{b:6d}  " + "  ".join(f"{c:>20s}" for c in cells))
L += ["", "fraction of seeds reaching the full true front (hypervolume ratio >= 0.9999), by budget:",
      "budget  " + "  ".join(f"{n:>10s}" for n in NAMES)]
for j, b in enumerate(BUD):
    L.append(f"{b:6d}  " + "  ".join(f"{np.mean(res[n][:, j] >= 0.9999):10.2f}" for n in NAMES))
L += ["", "== H. mean hypervolume ratio by number of syntheses (plain numbers, for the figure) ==",
      "budget  " + "  ".join(f"{n:>10s}" for n in NAMES)]
for j, b in enumerate(BUD):
    L.append(f"{b:6d}  " + "  ".join(f"{res[n][:, j].mean():10.3f}" for n in NAMES))
j = BUD.index(12)
L += ["", "paired difference from random at budget 12 (same seed index): mean, share of seeds better / worse"]
for n in NAMES[1:]:
    d = res[n][:, j] - res["random"][:, j]
    L.append(f"  {n:9s} {d.mean():+.3f}  better {np.mean(d > 0):.2f}  worse {np.mean(d < 0):.2f}")
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
