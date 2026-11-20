"""Zero-synthesis designer-prior baseline (added after the 2026-11-20 quality audit).

Cells are assumed proportional to lanes x weight width (ABC -fast 10% larger); no synthesis is spent on fitting. Designs are
synthesised in order of non-dominated rank of (prior cells, cycles, error), ties at random. Run: PYTHONPATH=src python experiments/prior_baseline.py
"""
import os
import numpy as np
from eda_cheapaware import bench
from eda_cheapaware.screen import front_ranks
from eda_cheapaware.space import DIMS, Space, load_table

D = os.path.dirname(os.path.abspath(__file__))
sp = Space(load_table(os.path.join(D, "table.jsonl")))


def prior(x):
    return DIMS["p"][x[0]] * DIMS["wb"][x[1]] * (1.1 if x[2] == 1 else 1.0)


rank = front_ranks({x: (prior(x),) + tuple(sp.cheap(x)) for x in sp.all()})
BUD, SEEDS = [4, 8, 12, 20], 100
res = []
for s in range(SEEDS):
    rng = np.random.default_rng(s)
    order = sorted(sp.all(), key=lambda x: (rank[x], rng.random()))
    res.append(bench.curve(sp, order, BUD))
res = np.array(res)
for j, b in enumerate(BUD):
    print(f"{b:3d}  mean {res[:, j].mean():.3f}  full front {np.mean(res[:, j] >= 0.9999):.2f}")
