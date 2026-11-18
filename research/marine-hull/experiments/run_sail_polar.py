"""Milestone 5a, part 1: polar of the wing-sail drone model, swept over its unsourced parameters.
Prints (a) the default drone's speed table, (b) a 200-draw random sweep of sail area, aspect ratio, CLmax, CD0, keel span,
hull drag scale and hull length: distribution of the best upwind true wind angle and VMG at 5 and 8 m/s, (c) the analytic check.
Also writes experiments/data/sail_polar_default.json (v and best angle vs wind speed) used by run_sail_tack.py.
Run: PYTHONPATH=src python3 experiments/run_sail_polar.py > experiments/results_sail_polar.txt"""
import json, math, random, statistics
from marine_hull.sail import Drone, vmg_up, cl_cd

def table(d):
    return {s: vmg_up(d, s) for s in [x * 0.5 for x in range(2, 41)]}

def quant(v, q):
    v = sorted(v); return v[min(len(v) - 1, int(q * (len(v) - 1)))]

def main():
    d = Drone()
    print("default drone: 5 m sail 5 m2 AR 3, Wigley 5 x 0.5 x 0.25 m, keel span 1 m, CLmax 1.2, CD0 0.012, Fr cap 0.5")
    print("speed (m/s) by true wind speed (rows) and true wind angle (cols)")
    angs = (30, 40, 50, 60, 90, 120, 150, 180)
    print("tws  " + " ".join(f"{a:5d}" for a in angs))
    for tws in (3, 5, 8, 12):
        print(f"{tws:3d}  " + " ".join(f"{d.speed(tws, a):5.2f}" for a in angs))
    tab = table(d)
    out = {str(s): {"vmg": round(m, 4), "twa": t, "v": round(d.speed(s, t), 4) if t else 0.0} for s, (m, t) in tab.items()}
    json.dump(out, open("experiments/data/sail_polar_default.json", "w"), indent=0)
    for s in (3, 5, 8, 12):
        m, t = tab[float(s)]
        print(f"default best upwind at {s} m/s: angle {t} deg, VMG {m:.2f} m/s, boat speed {d.speed(s, t):.2f} m/s")
    # sweep
    rng = random.Random(20261104)
    rows = []
    for _ in range(200):
        p = dict(sail_area=rng.uniform(3, 8), sail_ar=rng.uniform(2, 4.5), cl_max=rng.uniform(1.0, 1.5), cd0=rng.uniform(0.008, 0.02),
                 keel_span=rng.uniform(0.6, 1.4), hull_scale=rng.uniform(0.8, 1.6), length=rng.choice((4.0, 5.0, 6.0)))
        p["beam"], p["draft"] = p["length"] / 10, p["length"] / 20
        dd = Drone(**p)
        r = {}
        for s in (5, 8):
            m, t = vmg_up(dd, s, twas=range(24, 81, 2))
            r[s] = (m, t)
        rows.append(r)
    for s in (5, 8):
        ang = [r[s][1] for r in rows]; vm = [r[s][0] for r in rows]
        print(f"sweep n=200 at {s} m/s: best upwind angle median {statistics.median(ang):.0f} (10th {quant(ang,.1):.0f}, 90th {quant(ang,.9):.0f}, min {min(ang)}, max {max(ang)}) deg; "
              f"VMG median {statistics.median(vm):.2f} (10th {quant(vm,.1):.2f}, 90th {quant(vm,.9):.2f}) m/s")
    inside = sum(1 for r in rows if 35 <= r[5][1] <= 55)
    print(f"S1: best angle at 5 m/s inside 35..55 deg in {inside} of 200 draws")
    # analytic check: zero hull drag -> equilibrium apparent wind angle = atan(D/L) at best L/D
    z = Drone(hull_scale=1e-6, keel_span=1000.0)
    best = max((cl_cd(a / 10, z.sail_ar, z.cl_max, z.cd0)[0] / cl_cd(a / 10, z.sail_ar, z.cl_max, z.cd0)[1], a / 10) for a in range(1, 150))
    tws = 0.3
    v = z._speed_free(tws, 90.0, vmax=100.0)
    beta = math.degrees(math.atan2(tws, v))
    print(f"analytic check: max L/D {best[0]:.2f} at alpha {best[1]:.1f}; atan(D/L) = {math.degrees(math.atan(1/best[0])):.2f} deg; model apparent wind angle at equilibrium (twa 90, tws {tws}) = {beta:.2f} deg, v = {v:.2f} m/s")

main()
