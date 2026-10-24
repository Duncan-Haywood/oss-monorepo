"""Grid orders on the MAC and FIR families of eda-surrogate. Run: python experiments/run.py (stdlib only). Writes results.txt."""
import os
import sys

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(D, "..", "src"))
from eda_gridxfer import bench  # noqa: E402

SEEDS, BUD = 300, [2, 3, 4, 6, 8, 12, 16, 24]
L = ["# dataset: research/eda-surrogate (Yosys cells, analytic cycles); objectives cells, cycles; hypervolume reference (1.1, 1.1) on [0,1]-scaled objectives",
     f"# deterministic orders: 1 run. stochastic orders: {SEEDS} seeds, mean [95% bootstrap interval]"]
for fam in ("mac", "fir"):
    sp = bench.load(fam)
    full = bench.all_curves(sp, SEEDS)
    L += ["", f"## {fam}: {len(sp.all())} designs, axes {bench.AXES[fam]} with {sp.sizes} levels, true front {len(bench.true_front(sp))} points", "",
          "budget  " + "  ".join(f"{n:>26s}" for n in full)]
    for b in BUD:
        cells = []
        for n, a in full.items():
            m, lo, hi = bench.mean_ci([r[b - 1] for r in a])
            cells.append(f"{m:.3f}" + (f" [{lo:.3f},{hi:.3f}]" if lo is not None else ""))
        L.append(f"{b:6d}  " + "  ".join(f"{c:>26s}" for c in cells))
    L += ["", "evaluations needed to reach a fraction of the true-front hypervolume (stochastic: median over seeds):"]
    for frac in (0.90, 0.95, 1.0 - 1e-9):
        line = []
        for n, a in full.items():
            v = sorted(bench.first_budget_at(r, frac) for r in a)
            line.append(f"{n}={v[len(v) // 2]}")
        L.append(f"  {'full front' if frac > .999 else f'{frac:.0%}':10s} " + "  ".join(line))
    L += ["", "fraction of 300 random orders scoring strictly below the deterministic order, by budget:"]
    for n in ("lexicographic", "halton", "farthest"):
        L.append(f"  {n:14s} " + " ".join(f"b{b}={sum(r[b - 1] < full[n][0][b - 1] for r in full['random']) / SEEDS:.2f}" for b in BUD))
open(os.path.join(D, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
