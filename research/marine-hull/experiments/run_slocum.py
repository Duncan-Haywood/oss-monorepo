"""Milestone 4b: glider against AUV with Slocum aerodynamic coefficients from the gliderflight package.

Run: PYTHONPATH=src python3 experiments/run_slocum.py > experiments/results_slocum.txt
Sourced (gliderflight 1.2.1, MIT; Slocum defaults): S, AR, sweep, Oswald e, ah, Cd1_hull, and Cd0 range.
"""
import itertools
import math
import statistics
from marine_hull.glider import glide_state, glider_energy_per_m, auv_energy_per_m, interp_log
from marine_hull.hull import RHO_SEA

S, AR, OMEGA, E_OSW, AH, CD1_HULL = 0.1, 7.0, math.radians(43.0), 0.8, 3.8, 9.7
AW = 2 * math.pi * AR / (2 + math.sqrt(AR ** 2 * (1 + math.tan(OMEGA) ** 2) + 4))
A_SLOPE = AW + AH
K_IND = CD1_HULL + AW ** 2 / (math.pi * E_OSW * AR)
MASS = 52.0
VOL = MASS / RHO_SEA
SPEEDS = [0.1 + 0.025 * i for i in range(57)]   # 0.1 to 1.5 m/s
BS = [1.0 * (10.0 ** (i / 9.0)) for i in range(10)]   # 1 to 10 N
DEPTH = 500.0
GRID = dict(cd0=(0.15, 0.23, 0.31), b_max=BS, eta_pump=(0.3, 0.5, 0.7), e_cycle=(0.0, 5e3, 20e3),
            hotel=(0.7, 2.0, 5.0), auv=((1.5, 2.8, 0.1), (2.0, 3.2, 0.2), (2.5, 3.6, 0.3)))
AUV_X = (1.0, 5.0, 20.0)


def glider_best(cd0, b, eta, e_cycle, hotel):
    _, gam, uh = glide_state(b, S, A_SLOPE, cd0, K_IND)
    return glider_energy_per_m(b, uh, gam, hotel, eta, e_cycle, DEPTH), uh, math.degrees(gam)


def auv_best(auv, hotel):
    length, c_s, kf = auv
    return min(auv_energy_per_m(v, length, VOL, c_s, kf, hotel) for v in SPEEDS)


def breakeven(auv, e_g):
    """AUV hotel load (W) at which its best energy per metre equals the glider's; bisection."""
    lo, hi = 0.0, 1e3
    if auv_best(auv, 0.0) >= e_g:
        return 0.0   # the AUV loses even with no hotel load: no break-even (sentinel)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if auv_best(auv, mid) < e_g:
            lo = mid
        else:
            hi = mid
    return lo


def main():
    keys = list(GRID)
    wins = {x: [0, 0] for x in AUV_X}
    ratios, bes, speeds, gams = [], [], [], []
    n = 0
    for vals in itertools.product(*(GRID[k] for k in keys)):
        c = dict(zip(keys, vals))
        e_g, uh, gam = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        n += 1
        speeds.append(uh)
        gams.append(gam)
        for x in AUV_X:
            wins[x][0] += 1
            wins[x][1] += e_g < auv_best(c['auv'], c['hotel'] * x)
        ratios.append(auv_best(c['auv'], c['hotel']) / e_g)
        be = breakeven(c['auv'], e_g)
        if be > 0:
            bes.append(be / c['hotel'])
    print(f"gliderflight Slocum coefficients: S {S} m2, aw {AW:.2f}, ah {AH}, a = {A_SLOPE:.2f} /rad, K = {K_IND:.2f} /rad2")
    print(f"cases {n}; mass {MASS} kg; glider flown at best-glide incidence, one fixed buoyancy per case")
    q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
    print(f"glide angle deg: median {statistics.median(gams):.1f} (min {min(gams):.1f}, max {max(gams):.1f})")
    print(f"glider horizontal speed m/s: median {statistics.median(speeds):.2f} (10th {q(speeds,.1):.2f}, 90th {q(speeds,.9):.2f})")
    print(f"AUV/glider energy-per-metre ratio at equal hotel (>1: glider farther): median {statistics.median(ratios):.2f} "
          f"(10th {q(ratios,.1):.2f}, 90th {q(ratios,.9):.2f})")
    for x, (c, w) in wins.items():
        print(f"AUV hotel x{x:g}: glider longer best range in {w}/{c} ({100*w/c:.1f}%)")
    print(f"break-even AUV hotel multiple (glider ties AUV): defined in {len(bes)}/{n} cases; "
          f"median {statistics.median(bes):.2f} (10th {q(bes,.1):.2f}, 90th {q(bes,.9):.2f}); "
          f"cases where the AUV beats the glider even at zero hotel: {n-len(bes)}")


if __name__ == "__main__":
    main()
