"""Count-weighted against mass-weighted coverage of the processcover part family, and the machine choice
under each weighting. Writes results.txt."""
import itertools
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "selfrep-nextmachine" / "src"))
from selfrep_nextmachine.select import exhaustive, greedy  # noqa: E402
from simdesign_coverweight.weighted import PROCESSES, sample_parts, weights, wcoverage, wshop_value  # noqa: E402

N = 20000
MACHINES = {"cnc router": ("cnc", 800.0), "laser cutter": ("laser", 600.0), "casting setup": ("cast", 300.0)}
out = []
P = out.append
for kind, load in (("log", False), ("log", True), ("small", True), ("large", True)):
    P(f"## family '{kind}', {'with tip load F 1-1000 N' if load else 'geometry only'} (n={N}, seeds 0..4; mean over seeds)")
    seeds = [sample_parts(N, s, kind, load=load) for s in range(5)]
    P("process alone, count-weighted vs mass-weighted coverage:")
    for k in PROCESSES:
        c = [wcoverage({k}, p, weights(p, "count")) for p in seeds]
        m = [wcoverage({k}, p, weights(p, "mass")) for p in seeds]
        P(f"  {k:6s} count {np.mean(c):.3f}  mass {np.mean(m):.3f} [{min(m):.3f}, {max(m):.3f}]")
    P("shop coverage (fdm always present):")
    for r in range(4):
        for sub in itertools.combinations(["cnc", "laser", "cast"], r):
            c = np.mean([wcoverage({"fdm", *sub}, p, weights(p, "count")) for p in seeds])
            m = np.mean([wcoverage({"fdm", *sub}, p, weights(p, "mass")) for p in seeds])
            P(f"  fdm+{'+'.join(sub) or '-':16s} count {c:.3f}  mass {m:.3f}")
    p0 = seeds[0]
    P("machine choice by budget, seed 0 (assumed prices cnc 800, laser 600, cast 300):")
    for budget in (300, 600, 800, 900, 1100, 1400, 1700):
        row = []
        for mode in ("count", "mass"):
            val = wshop_value(p0, weights(p0, mode))
            e = exhaustive(MACHINES, budget, val)
            g = greedy(MACHINES, budget, val)
            ve = val({"fdm"} | {MACHINES[n][0] for n in e})
            vg = val({"fdm"} | {MACHINES[n][0] for n in g})
            row.append(f"{mode}: exh {sorted(e)} {ve:.3f} greedy {sorted(g)} {vg:.3f}")
        P(f"  budget {budget:5d}: " + " | ".join(row))
    P("")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
