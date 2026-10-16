"""Why is b = 1 mm infeasible once the minimum wall is relaxed? Grid over w, r at fixed gauge:
report the rule/limit violations of the best point (least total penalty) and the stress and buckling there."""
import os, sys
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import numpy as np
from simdesign_minwall import PROCESSES, Params, evaluate, dfm
from simdesign_minwall.ltb import governing_factor

dfm.BUCKLE_RULE, dfm.MIN_BUCKLE = "buckle", 3.0
L = []
for b, mw in ((1.0, 1.2), (1.0, 1.0), (0.8, 0.8), (1.5, 1.2)):
    dfm.MIN_WALL_ANY = mw
    proc = replace(PROCESSES["laser cutting"], b_stock=(b,))
    best = None
    for w in np.arange(2.0, 25.01, 1.0):
        for r in (0.2, 4.0, 8.0, 12.0, 15.0):
            e = evaluate(proc, Params(w=float(w), r=float(r), b=b), h=1.5)
            if best is None or e["penalty"] < best[0]["penalty"]:
                best = (e, w, r)
    e, w, r = best
    nz = {k: round(v, 3) for k, v in e["violations"].items() if v > 1e-9}
    fe = e["fe"]
    L.append(f"b={b} minwall={mw}: least-penalty grid point w={w:.0f} r={r:.1f}: feasible={e['feasible']} violations={nz} "
             f"peak={fe['peak_mpa'] if fe else float('nan'):.1f} MPa factor={float(governing_factor(w, b)):.2f}")
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "diagnose.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
