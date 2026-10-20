"""Compare grid orders on the eda-proposers table. Run: python experiments/run.py (stdlib only). Writes results.txt."""
import os
import sys

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(D, "..", "src"))
from eda_gridorder import bench, orders  # noqa: E402
from eda_gridorder.bench import table  # noqa: E402

TAB = os.path.join(D, "..", "..", "eda-proposers", "experiments", "table.jsonl")
rows = table.load_table(TAB)
sp = table.Space(rows)
BUD, SEEDS = [4, 8, 12, 16, 20, 30, 40], 300
FULL = list(range(1, 81))
full = bench.all_curves(sp, FULL, SEEDS)
res = {n: [[r[b - 1] for b in BUD] for r in a] for n, a in full.items()}
L = [f"# {rows[0]['yosys']}; table from research/eda-proposers (80 designs = p 1..8 x wb 4..8 x abc {{gates, fast}})",
     "# metric: hypervolume of found front / hypervolume of true front (reference 1.1,1.1,1.1), objectives cells, cycles, 1-accuracy",
     f"# deterministic orders: 1 run. stochastic orders: {SEEDS} seeds, mean [95% bootstrap interval]", "",
     "budget  " + "  ".join(f"{n:>26s}" for n in res)]
for j, b in enumerate(BUD):
    cells = []
    for n, a in res.items():
        m, lo, hi = bench.mean_ci([r[j] for r in a])
        cells.append(f"{m:.3f}" + (f" [{lo:.3f},{hi:.3f}]" if lo is not None else ""))
    L.append(f"{b:6d}  " + "  ".join(f"{c:>26s}" for c in cells))
# how far does the deterministic ordering's score sit inside the random distribution?
L += ["", "rank of each deterministic order among 300 random orders (fraction of random seeds scoring strictly below it):"]
for n in ("lexicographic", "halton", "farthest"):
    L.append(f"  {n:14s} " + " ".join(f"b{b}={sum(r[j] < res[n][0][j] for r in res['random']) / SEEDS:.2f}" for j, b in enumerate(BUD)))
# evaluations to reach 90% / 95% of the true-front hypervolume
L += ["", "evaluations needed to reach a fraction of the true-front hypervolume (stochastic: median over seeds):"]
for frac in (0.90, 0.95, 1.0 - 1e-9):
    line = []
    for n, (fn, stoch) in orders.ORDERS.items():
        v = sorted(bench.first_budget_at(r, frac) for r in full[n])
        line.append(f"{n}={v[len(v) // 2]}")
    L.append(f"  {'full front' if frac > .999 else f'{frac:.0%}':10s} " + "  ".join(line))
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
