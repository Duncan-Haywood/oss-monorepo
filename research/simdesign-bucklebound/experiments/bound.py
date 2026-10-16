"""Laser-cut steel bracket, minimum mass at each sheet gauge, under three buckling guards:
the old w/b <= 8 ceiling, and a closed-form lateral-torsional-buckling factor floor of 1 and of 3.
Differential evolution, seed 0..2, mesh h = 1.5 mm, peak von Mises. Writes bound.txt and bound.json."""
import json, os, sys
from dataclasses import replace
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_bucklebound import PROCESSES, optimise, dfm
from simdesign_bucklebound.ltb import governing_factor

OUT = os.path.dirname(os.path.abspath(__file__))
GAUGES = (1.0, 1.5, 2.0, 3.0)
GUARDS = (("w/b<=8", "slender", None), ("factor>=1", "buckle", 1.0), ("factor>=3", "buckle", 3.0))
SEEDS = (0, 1, 2)
H = 1.5


def one(args):
    b, gname, rule, thr, seed = args
    dfm.BUCKLE_RULE = rule
    if thr is not None:
        dfm.MIN_BUCKLE = thr
    proc = replace(PROCESSES["laser cutting"], b_stock=(b,))
    o = optimise(proc, seed=seed, popsize=8, maxiter=25, h=H, measure="peak")
    if not o["feasible"]:
        return b, gname, seed, None
    p = o["params"]
    return b, gname, seed, dict(w=p.w, r=p.r, mass=o["mass_g"], peak=o["peak_mpa"], tip=o["tip_mm"],
                                factor=float(governing_factor(p.w, p.b)), n_fe=o["n_fe"])


if __name__ == "__main__":
    jobs = [(b, g, rule, thr, s) for b in GAUGES for g, rule, thr in GUARDS for s in SEEDS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs))
    data = {}
    for b, g, s, d in res:
        data.setdefault(str(b), {}).setdefault(g, {})[str(s)] = d
    L = [f"laser cutting, steel sheet, mesh h={H} mm, peak von Mises, DE seeds {SEEDS}: best (lightest) feasible design over seeds"]
    for b in GAUGES:
        for g, _, _ in GUARDS:
            ds = [d for d in data[str(b)][g].values() if d]
            if not ds:
                L.append(f"b={b:3.1f} {g:10s}: no feasible design in any seed"); continue
            d = min(ds, key=lambda d: d["mass"])
            L.append(f"b={b:3.1f} {g:10s}: w={d['w']:5.2f} r={d['r']:5.2f} mass={d['mass']:6.2f} g peak={d['peak']:5.1f} MPa "
                     f"tip={d['tip']:.2f} mm buckling factor={d['factor']:5.2f} ({len(ds)}/{len(SEEDS)} seeds feasible)")
    open(os.path.join(OUT, "bound.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "bound.json"), "w"), indent=1)
    print("\n".join(L))
