"""Optimise the laser-cut steel bracket under three out-of-plane guards: the old w/b <= 8 rule, a
lateral-torsional buckling factor >= BUCKLE_MIN, and no guard. Writes guards.txt and guards.json."""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_buckleguard import PROCESSES, optimise, dfm, ltb

OUT = os.path.dirname(os.path.abspath(__file__))
GUARDS = ("slender", "buckling", "none")
SEEDS = (0, 1, 2)
H = 1.5


def one(args):
    guard, seed = args
    dfm.GUARD = guard
    r = optimise(PROCESSES["laser cutting"], seed=seed, popsize=6, maxiter=20, h=H, measure="peak")
    if not r["feasible"]:
        return guard, seed, None
    p = r["params"]
    return guard, seed, dict(w=p.w, r=p.r, b=p.b, mass=r["mass_g"], peak=r["peak_mpa"], tip=r["tip_mm"],
                             factor=float(ltb.governing_factor(p.w, p.b)), n_fe=r["n_fe"])


if __name__ == "__main__":
    jobs = [(g, s) for g in GUARDS for s in SEEDS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs))
    data = {}
    for g, s, d in res:
        data.setdefault(g, {})[str(s)] = d
    L = [f"laser cutting (steel sheet), h={H} mm, peak von Mises, DE popsize 6 maxiter 20, seeds {SEEDS}",
         f"buckling guard: governing LTB factor >= {dfm.BUCKLE_MIN}; slender guard: w/b <= {dfm.MAX_SLENDER}",
         "guard     seed   b(mm)  w(mm)  r(mm)  mass(g)  peak(MPa)  tip(mm)  LTB factor  n_fe"]
    for g in GUARDS:
        for s in SEEDS:
            d = data[g][str(s)]
            L.append(f"{g:9s} {s:4d}   " + ("infeasible" if d is None else
                     f"{d['b']:5.2f} {d['w']:6.2f} {d['r']:6.2f} {d['mass']:8.2f} {d['peak']:9.1f} {d['tip']:8.3f} {d['factor']:10.2f} {d['n_fe']:5d}"))
    open(os.path.join(OUT, "guards.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "guards.json"), "w"))
    print("\n".join(L))
