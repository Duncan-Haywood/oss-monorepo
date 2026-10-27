"""Milestone 4d: energy-delay product of the 4b glider cases against 4c's REMUS-class AUV cases.

Run: PYTHONPATH=src python3 experiments/run_time.py > experiments/results_time.txt
"""
import itertools
import math
import statistics
from marine_hull.glider import auv_energy_per_m
from run_slocum import GRID, glider_best
from run_remus import L, VOL, CS, P_TOTAL, FORM, ETA, prop_w

AUV_SPEEDS = [0.1 + 0.05 * i for i in range(45)]   # 0.1 to 2.3 m/s, the datasheet maximum; 4c stopped at 1.5


def auv_opt(k, eta, hotel):
    return min((auv_energy_per_m(v, L, VOL, CS, k, hotel, eta=eta), v) for v in AUV_SPEEDS)


def main():
    q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
    gkeys = [k for k in GRID if k != 'auv']
    glider = []
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        e, uh, _ = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        glider.append((e, uh))
    days = [1e5 / uh / 86400 for _, uh in glider]
    print(f"glider cases {len(glider)}: days per 100 km median {statistics.median(days):.1f} (10th {q(days,.1):.1f}, 90th {q(days,.9):.1f}); share over 10 days {100*sum(d > 10 for d in days)/len(days):.1f}%")
    autos = []
    for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL):
        h = pt - prop_w(k, eta)
        e, v = auv_opt(k, eta, h)
        autos.append((e, v))
    print(f"AUV cases {len(autos)}: best-energy speed median {statistics.median(v for _, v in autos):.2f} m/s, hours per 100 km {1e5/statistics.median(v for _, v in autos)/3600:.1f}")
    # exponent alpha: score = (E/m)^1 * (s/m)^alpha ; alpha = 1 is EDP; crossover alpha where platforms tie
    edp_auv_wins = tot = 0
    alphas = []
    for eg, ug in glider:
        for ea, va in autos:
            tot += 1
            edp_auv_wins += (ea / va) < (eg / ug)
            if ea > eg and va > ug:
                alphas.append(math.log(ea / eg) / math.log(va / ug))   # delay weight at which the two tie
    print(f"pairs {tot}: AUV has lower energy-delay product in {edp_auv_wins} ({100*edp_auv_wins/tot:.1f}%)")
    if alphas:
        print(f"delay exponent at which the platforms tie (E x t^a; glider preferred below it): median {statistics.median(alphas):.2f} (10th {q(alphas,.1):.2f}, 90th {q(alphas,.9):.2f}), pairs with a crossover {len(alphas)}")


if __name__ == "__main__":
    main()
