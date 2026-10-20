"""When does the buckling guard bind? Laser cutting, min-mass design by differential evolution,
old rule (w/b <= 8) vs buckling factor >= 3, over tip load and arm length. Writes sweep.txt/json."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_loadbind import PROCESSES, optimise, dfm, ltb

OUT = os.path.dirname(os.path.abspath(__file__))
CASES = [("load", F, 80.0) for F in (50.0, 100.0, 200.0, 400.0)] + [("arm", 100.0, A) for A in (60.0, 120.0)]
GUARDS = ("slender", "buckling", "none")
SEEDS = (0, 1)


def one(args):
    F, A, guard, seed = args
    dfm.LOAD_N, dfm.ARM_MM, dfm.GUARD, dfm.BUCKLE_MIN = F, A, guard, 3.0
    r = optimise(PROCESSES["laser cutting"], seed=seed, popsize=6, maxiter=20, h=1.5, measure="peak")
    if not r["feasible"]:
        return None
    p = r["params"]
    return dict(w=p.w, r=p.r, b=p.b, mass=r["mass_g"], peak=r["peak_mpa"], tip=r["tip_mm"],
                factor=float(ltb.governing_factor(p.w, p.b, F=F, L=A, H=A)))


if __name__ == "__main__":
    jobs = [(F, A, g, s) for _, F, A in CASES for g in GUARDS for s in SEEDS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs))
    data = {f"{F}|{A}|{g}|{s}": d for (F, A, g, s), d in zip(jobs, res)}
    L = ["laser cutting, h=1.5 mm, peak von Mises, DE popsize 6 maxiter 20; guard 'buckling' = LTB factor >= 3",
         " F(N) arm(mm) guard      seed  b(mm)  w(mm)  r(mm)  mass(g)  peak  tip(mm)  LTB factor"]
    for (F, A, g, s), d in zip(jobs, res):
        L.append(f"{F:5.0f} {A:6.0f}  {g:9s} {s:4d}  " + ("infeasible" if d is None else
                 f"{d['b']:5.1f} {d['w']:6.2f} {d['r']:6.2f} {d['mass']:8.2f} {d['peak']:6.1f} {d['tip']:7.2f} {d['factor']:10.2f}"))
    open(os.path.join(OUT, "sweep.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "sweep.json"), "w"))
    print("\n".join(L))
