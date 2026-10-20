"""Coverage of a sampled bracket-feature family by each shop process and process subset, and the
greedy-vs-exhaustive machine choice when coverage is the objective. Writes results.txt."""
import itertools
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "selfrep-nextmachine" / "src"))
from selfrep_nextmachine.select import exhaustive, greedy  # noqa: E402
from simdesign_processcover import PROCESSES, feasible, coverage, sample_parts, shop_value  # noqa: E402

N = 20000
MACHINES = {"cnc router": ("cnc", 800.0), "laser cutter": ("laser", 600.0), "casting setup": ("cast", 300.0)}
out = []
P = out.append

for kind, load in (("log", False), ("log", True), ("small", True), ("large", True)):
    P(f"## family '{kind}', {'with tip load F 1-1000 N' if load else 'geometry only'} (n={N}, seeds 0..4; mean and range over seeds)")
    seeds = [sample_parts(N, s, kind, load=load) for s in range(5)]
    P("process alone:")
    for k in PROCESSES:
        v = [coverage({k}, p) for p in seeds]
        P(f"  {k:6s} {np.mean(v):.3f}  [{min(v):.3f}, {max(v):.3f}]")
    P("shop (fdm always present) -> coverage; marginal gain of each machine added to fdm:")
    names = ["cnc", "laser", "cast"]
    for r in range(4):
        for sub in itertools.combinations(names, r):
            v = [coverage({"fdm", *sub}, p) for p in seeds]
            P(f"  fdm+{'+'.join(sub) or '-':16s} {np.mean(v):.3f}")
    # parts only one process can make
    p0 = seeds[0]
    m = {k: feasible(PROCESSES[k], p0) for k in PROCESSES}
    none = ~np.any(np.column_stack(list(m.values())), axis=1)
    P(f"  parts no process can make: {none.mean():.3f}")
    for k in PROCESSES:
        others = np.any(np.column_stack([m[j] for j in PROCESSES if j != k]), axis=1)
        P(f"  parts only {k} can make: {(m[k] & ~others).mean():.3f}")
    P("machine choice by budget (greedy vs exhaustive; assumed prices cnc 800, laser 600, cast 300):")
    val = shop_value(p0)
    for budget in (300, 600, 800, 900, 1100, 1400, 1700):
        e = exhaustive(MACHINES, budget, val)
        g = greedy(MACHINES, budget, val)
        ve = val({"fdm"} | {MACHINES[n][0] for n in e})
        vg = val({"fdm"} | {MACHINES[n][0] for n in g})
        P(f"  budget {budget:5d}: exhaustive {e} cov {ve:.3f}; greedy {g} cov {vg:.3f}")
    P("")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
