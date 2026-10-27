"""Milestone 4e: break-even value of a day of delay, in kWh per day, glider against the REMUS-class AUV.

Run: PYTHONPATH=src:experiments python3 experiments/run_value.py > experiments/results_value.txt
"""
import itertools
import statistics
from run_slocum import GRID, glider_best
from run_remus import P_TOTAL, FORM, ETA, prop_w
from run_time import auv_opt

TRANSECT_M = 1e5
J_PER_KWH = 3.6e6


def main():
    q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
    gkeys = [k for k in GRID if k != 'auv']
    glider = []
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        e, uh, _ = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        glider.append((e, uh))
    autos = []
    for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL):
        e, v = auv_opt(k, eta, pt - prop_w(k, eta))
        autos.append((e, v))
    vstar, rel, never = [], [], 0
    for eg, ug in glider:
        for ea, va in autos:
            dt = (TRANSECT_M / ug - TRANSECT_M / va) / 86400      # extra days the glider takes
            de = (ea - eg) * TRANSECT_M / J_PER_KWH               # kWh the glider saves
            if de <= 0 or dt <= 0:
                never += 1
                continue
            vstar.append(de / dt)
            rel.append(de / dt / (ea * va * 86400 / J_PER_KWH))   # v* over the AUV's own kWh per day
    n = len(glider) * len(autos)
    print(f"pairs {n}; pairs where the glider saves energy and takes longer (a tie value exists): {len(vstar)}; others {never}")
    print(f"v* kWh per day: median {statistics.median(vstar):.2f} (10th {q(vstar,.1):.2f}, 90th {q(vstar,.9):.2f}, min {min(vstar):.2f}, max {max(vstar):.2f})")
    print(f"v* as a multiple of the AUV's own daily energy use: median {statistics.median(rel):.2f} (10th {q(rel,.1):.2f}, 90th {q(rel,.9):.2f})")
    print(f"share of pairs with v* below the AUV's daily energy use: {100*sum(r < 1 for r in rel)/len(rel):.1f}%")
    for v in (0.1, 0.5, 1, 2, 5):
        print(f"glider cheaper if a day of delay is worth {v} kWh: {100*sum(x > v for x in vstar)/n:.1f}% of all pairs")


if __name__ == "__main__":
    main()
