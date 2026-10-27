"""Milestone 4c: Slocum-class glider against a REMUS 100M, with the AUV's hotel load implied by its datasheet.

Run: PYTHONPATH=src python3 experiments/run_remus.py > experiments/results_remus.txt
Sourced: REMUS 100M datasheet (HII, 2022; see marine_hull/remus.py); glider coefficients as run_slocum.py;
glider hotel 0.5 W from Bruvik et al. 2020 (doi:10.5194/os-16-291-2020), swept up to 5 W.
"""
import itertools
import statistics
from marine_hull import remus
from marine_hull.glider import glide_state, glider_energy_per_m, auv_energy_per_m
from marine_hull.hull import RHO_SEA
from run_slocum import S, A_SLOPE, K_IND

VOL = remus.MASS / RHO_SEA
C_S = remus.cylinder_c_s()
ETA = 0.55 * 0.85
SPEEDS = [0.1 + 0.05 * i for i in range(45)]   # 0.1 to 2.3 m/s
KF = (0.1, 1.0, 3.0)                            # (1 + kf) = 1.1, 2, 4
TOTALS = {"10 h": remus.total_power(endurance_h=remus.ENDURANCE_H), "67 km": remus.total_power(range_m=remus.RANGE_M)}
BS = [1.0 * 10.0 ** (i / 9.0) for i in range(10)]
GRID = dict(cd0=(0.15, 0.23, 0.31), b=BS, eta=(0.3, 0.5, 0.7), e_cycle=(0.0, 5e3, 20e3), hotel=(0.5, 2.0, 5.0))
DEPTH = 500.0


def auv_best(kf, hotel):
    return min(auv_energy_per_m(v, remus.LENGTH, VOL, C_S, kf, hotel) for v in SPEEDS)


def propulsion_w(kf):
    return auv_energy_per_m(remus.V_REF, remus.LENGTH, VOL, C_S, kf, 0.0) * remus.V_REF


def tie_hotel(kf, e_g):
    lo, hi = 0.0, 1e3
    if auv_best(kf, 0.0) >= e_g:
        return 0.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if auv_best(kf, mid) < e_g else (lo, mid)
    return lo


def main():
    print(f"REMUS 100M: L {remus.LENGTH} m, D {remus.DIAMETER} m, {remus.MASS} kg, c_s {C_S:.2f} (cylinder), {remus.BATTERY_WH:.0f} Wh")
    hotels = {}
    for kf in KF:
        pp = propulsion_w(kf)
        print(f"  (1+kf) {1+kf:.1f}: modelled propulsion at 1.5 m/s {pp:.1f} W electrical")
        for name, pt in TOTALS.items():
            hotels[(kf, name)] = remus.implied_hotel(pt, pp)
            print(f"    datasheet {name}: total {pt:.0f} W, implied hotel {hotels[(kf, name)]:.0f} W")
    print(f"implied hotel range {min(hotels.values()):.0f} to {max(hotels.values()):.0f} W")
    keys = list(GRID)
    wins = tot = 0
    by = {}
    ratios, ties = [], []
    for vals in itertools.product(*(GRID[k] for k in keys)):
        c = dict(zip(keys, vals))
        _, gam, uh = glide_state(c["b"], S, A_SLOPE, c["cd0"], K_IND)
        e_g = glider_energy_per_m(c["b"], uh, gam, c["hotel"], c["eta"], c["e_cycle"], DEPTH)
        for (kf, name), h in hotels.items():
            e_a = auv_best(kf, h)
            w = e_g < e_a
            wins += w
            tot += 1
            by.setdefault(c["hotel"], [0, 0])
            by[c["hotel"]][0] += w
            by[c["hotel"]][1] += 1
            ratios.append(e_a / e_g)
            ties.append(tie_hotel(kf, e_g))
    q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
    print(f"comparisons {tot}; glider longer best range in {wins} ({100*wins/tot:.1f}%)")
    for h, (w, n) in sorted(by.items()):
        print(f"  glider hotel {h:g} W: glider wins {w}/{n} ({100*w/n:.1f}%)")
    print(f"AUV/glider energy-per-metre ratio: median {statistics.median(ratios):.1f} (10th {q(ratios,.1):.1f}, 90th {q(ratios,.9):.1f}, min {min(ratios):.2f})")
    print(f"AUV hotel (W) at which it ties the glider: median {statistics.median(ties):.1f} (10th {q(ties,.1):.1f}, 90th {q(ties,.9):.1f})")


if __name__ == "__main__":
    main()
