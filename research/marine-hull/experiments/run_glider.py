"""Milestone 4: crossover speed between a buoyancy glider and a propeller AUV (H4).

Run: PYTHONPATH=src python3 experiments/run_glider.py > experiments/results_glider.txt
"""
import itertools
import math
import statistics
from marine_hull.glider import B_MAX, glide_state, glider_energy_per_m, auv_energy_per_m, interp_log
from marine_hull.hull import RHO_SEA

MASS = 52.0
VOL = MASS / RHO_SEA
SPEEDS = [0.1 + 0.05 * i for i in range(29)]   # 0.1 to 1.5 m/s
BS = [0.002 * 1.12 ** i for i in range(120)]
BS = [b for b in BS if b <= B_MAX]

GRID = dict(
    a_w=(0.06, 0.1, 0.15), cl_slope=(2.0, 3.5, 5.0), cd0=(0.05, 0.1, 0.2),
    k=(0.1, 0.25, 0.5), eta_pump=(0.3, 0.5, 0.7), hotel=(0.5, 2.0, 5.0),
    e_cycle=(0.0, 5e3, 20e3), auv_hotel_x=(1.0, 5.0, 20.0), auv=((1.5, 2.8, 0.1), (2.0, 3.2, 0.2), (2.5, 3.6, 0.3)),
)
DEPTH = 500.0


def case(a_w, cl_slope, cd0, k, eta_pump, hotel, e_cycle, auv_hotel_x, auv):
    length, c_s, kf = auv
    uh, e_g = [], []
    for b in BS:
        _, gam, u = glide_state(b, a_w, cl_slope, cd0, k)
        uh.append(u)
        e_g.append(glider_energy_per_m(b, u, gam, hotel, eta_pump, e_cycle, DEPTH))
    # uh is increasing in b; interpolate glider energy per metre at each target speed
    glider = [interp_log(uh, e_g, v) for v in SPEEDS]
    auv_e = [auv_energy_per_m(v, length, VOL, c_s, kf, hotel * auv_hotel_x) for v in SPEEDS]
    return glider, auv_e, uh[-1]


def main():
    keys = list(GRID)
    by_x = {x: [0, 0] for x in GRID['auv_hotel_x']}
    n = 0
    cross, win025, auv_win10, best_ratio, glider_best_v = [], 0, 0, [], []
    n025 = n10 = 0
    no_cross = 0
    vmax = []
    for vals in itertools.product(*(GRID[k] for k in keys)):
        g, a, vm = case(**dict(zip(keys, vals)))
        n += 1
        vmax.append(vm)
        i025, i10 = SPEEDS.index(min(SPEEDS, key=lambda s: abs(s - 0.25))), SPEEDS.index(min(SPEEDS, key=lambda s: abs(s - 1.0)))
        if g[i025] is not None:
            n025 += 1
            win025 += g[i025] < a[i025]
        if g[i10] is not None:
            n10 += 1
            auv_win10 += a[i10] < g[i10]
        x = None
        for v, ge, ae in zip(SPEEDS, g, a):
            if ge is not None and ae < ge:
                x = v
                break
        if x is None:
            no_cross += 1
        else:
            cross.append(x)
        gv = [(e, v) for e, v in zip(g, SPEEDS) if e is not None]
        eg, vg = min(gv)
        ea = min(a)
        best_ratio.append(ea / eg)
        xk = dict(zip(keys, vals))['auv_hotel_x']
        by_x[xk][0] += 1
        by_x[xk][1] += ea > eg   # >1: glider best range exceeds AUV best range
        glider_best_v.append(vg)
    print(f"cases {n}; mass {MASS} kg; speeds 0.1 to 1.5 m/s; battery cancels")
    print(f"glider wins at 0.25 m/s: {win025}/{n025} ({100*win025/n025:.1f}%)")
    print(f"glider can reach 0.25 m/s in {n025}/{n} cases, 1.0 m/s in {n10}/{n} (pump capped at {B_MAX} N)")
    if n10:
        print(f"AUV wins at 1.0 m/s: {auv_win10}/{n10} ({100*auv_win10/n10:.1f}%)")
    print(f"glider max horizontal speed: median {statistics.median(vmax):.2f}, min {min(vmax):.2f}, max {max(vmax):.2f} m/s")
    print(f"crossover found in {len(cross)}/{n}; none (glider wins everywhere reachable) in {no_cross}")
    if cross:
        cs = sorted(cross)
        q = lambda p: cs[int(p * (len(cs) - 1))]
        inb = sum(1 for c in cross if 0.4 <= c <= 0.9)
        print(f"crossover speed m/s: median {q(0.5):.2f} (10th {q(0.1):.2f}, 90th {q(0.9):.2f}); "
              f"in 0.4-0.9: {inb}/{n} ({100*inb/n:.1f}% of all cases, {100*inb/len(cross):.1f}% of those with a crossover)")
    br = sorted(best_ratio)
    print(f"best-range ratio glider/AUV (each at its own best speed): median {statistics.median(br):.2f}, "
          f"10th {br[len(br)//10]:.2f}, 90th {br[9*len(br)//10]:.2f}; glider longer in {100*sum(r>1 for r in br)/n:.1f}%")
    for xk, (c, w) in by_x.items():
        print(f"AUV hotel load x{xk:g} the glider's: glider longer best range in {w}/{c} ({100*w/c:.1f}%)")
    print(f"glider best-range horizontal speed: median {statistics.median(glider_best_v):.2f} m/s")


if __name__ == "__main__":
    main()
