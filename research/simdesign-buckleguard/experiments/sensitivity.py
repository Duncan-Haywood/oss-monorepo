"""How much does the required buckling factor K cost? Fixed gauge, laser cutting, K swept, seed 0.
Writes sensitivity.txt and sensitivity.json."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_buckleguard import PROCESSES, optimise, dfm, ltb

OUT = os.path.dirname(os.path.abspath(__file__))
GAUGES = (1.5, 2.0, 3.0)
KS = (1.0, 3.0, 5.0, 8.0, 12.0)
H = 1.5


def one(args):
    b, k = args
    dfm.GUARD, dfm.BUCKLE_MIN = "buckling", k
    proc = replace(PROCESSES["laser cutting"], b_stock=(b,))
    r = optimise(proc, seed=0, popsize=6, maxiter=20, h=H, measure="peak")
    if not r["feasible"]:
        return b, k, None
    p = r["params"]
    return b, k, dict(w=p.w, r=p.r, mass=r["mass_g"], peak=r["peak_mpa"], factor=float(ltb.governing_factor(p.w, b)))


if __name__ == "__main__":
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, [(b, k) for b in GAUGES for k in KS]))
    data = {f"{b}|{k}": d for b, k, d in res}
    L = [f"laser cutting, fixed gauge, h={H} mm, seed 0, guard: LTB factor >= K",
         "b(mm)    K   w(mm)  r(mm)  mass(g)  peak(MPa)  LTB factor"]
    for b, k, d in res:
        L.append(f"{b:5.1f} {k:4.0f}   " + ("infeasible" if d is None else
                 f"{d['w']:5.2f} {d['r']:6.2f} {d['mass']:8.2f} {d['peak']:9.1f} {d['factor']:10.2f}"))
    open(os.path.join(OUT, "sensitivity.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "sensitivity.json"), "w"))
    print("\n".join(L))
