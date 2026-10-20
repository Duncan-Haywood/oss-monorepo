"""Laser-cut steel bracket: does relaxing the 1.2 mm minimum-wall rule open thin gauges?
Gauge b x minimum wall (MIN_WALL_ANY) under a buckling-factor floor of 3. Differential evolution,
seeds 0..2, mesh h = 1.5 mm, peak von Mises. Writes minwall.txt and minwall.json."""
import json, os, sys
from dataclasses import replace
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from simdesign_minwall import PROCESSES, optimise, dfm
from simdesign_minwall.ltb import governing_factor

OUT = os.path.dirname(os.path.abspath(__file__))
GAUGES = (0.8, 1.0, 1.5)
MINWALLS = (1.2, 1.0, 0.8)
FLOORS = (3.0, 1.0)
SEEDS = (0, 1, 2)
H = 1.5


def one(args):
    b, mw, fl, seed = args
    dfm.BUCKLE_RULE, dfm.MIN_BUCKLE, dfm.MIN_WALL_ANY = "buckle", fl, mw
    proc = replace(PROCESSES["laser cutting"], b_stock=(b,))
    o = optimise(proc, seed=seed, popsize=8, maxiter=25, h=H, measure="peak")
    if not o["feasible"]:
        return b, mw, fl, seed, None
    p = o["params"]
    return b, mw, fl, seed, dict(w=p.w, r=p.r, mass=o["mass_g"], peak=o["peak_mpa"], tip=o["tip_mm"],
                             factor=float(governing_factor(p.w, p.b)), n_fe=o["n_fe"])


if __name__ == "__main__":
    jobs = [(b, mw, fl, s) for b in GAUGES for fl in FLOORS for mw in MINWALLS for s in SEEDS]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(one, jobs))
    data = {}
    for b, mw, fl, s, d in res:
        data.setdefault(str(b), {}).setdefault(str(fl), {}).setdefault(str(mw), {})[str(s)] = d
    L = [f"laser cutting, steel sheet, buckling factor floor 3 and 1, mesh h={H} mm, peak von Mises, DE seeds {SEEDS}: lightest feasible design over seeds"]
    for b in GAUGES:
      for fl in FLOORS:
        for mw in MINWALLS:
            ds = [d for d in data[str(b)][str(fl)][str(mw)].values() if d]
            if not ds:
                L.append(f"b={b:3.1f} floor={fl:3.1f} minwall={mw:3.1f}: no feasible design in any seed"); continue
            d = min(ds, key=lambda d: d["mass"])
            L.append(f"b={b:3.1f} floor={fl:3.1f} minwall={mw:3.1f}: w={d['w']:5.2f} r={d['r']:5.2f} mass={d['mass']:6.2f} g peak={d['peak']:5.1f} MPa "
                     f"tip={d['tip']:.2f} mm buckling factor={d['factor']:5.2f} ({len(ds)}/{len(SEEDS)} seeds feasible)")
    open(os.path.join(OUT, "minwall.txt"), "w").write("\n".join(L) + "\n")
    json.dump(data, open(os.path.join(OUT, "minwall.json"), "w"), indent=1)
    print("\n".join(L))
