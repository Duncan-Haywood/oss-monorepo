"""Milestone 4c: the 4b glider cases against a REMUS-100-class AUV whose hotel load is implied by vendor endurance.

Run: PYTHONPATH=src python3 experiments/run_remus.py > experiments/results_remus.txt
Sourced (vendor, approximate): 1.5 kWh, 12 h at 1.5 m/s (UST magazine, Robot Report); 8 h at 3 kn with standard
sensors, 38.6 kg, 1.85 m long, 0.19 m diameter (REMUS 100B datasheet 2022). Glider side: run_slocum.py.
"""
import itertools
import math
import statistics
from marine_hull.glider import auv_energy_per_m
from marine_hull.hull import RHO_SEA
from run_slocum import (GRID, SPEEDS, glider_best)

L, D, MASS = 1.85, 0.19, 38.6
VOL = MASS / RHO_SEA
CS = math.pi * D * L / math.sqrt(VOL * L)
U_REF = 1.5
P_TOTAL = (125.0, 150.0, 188.0)      # W: 1.5 kWh / 12 h, midpoint, 1.5 kWh / 8 h
FORM = (0.1, 0.2, 0.3)
ETA = ((0.55 * 0.85), (0.7 * 0.9))


def prop_w(k, eta):
    return auv_energy_per_m(U_REF, L, VOL, CS, k, 0.0, eta=eta) * U_REF


def auv_best(k, eta, hotel):
    return min(auv_energy_per_m(v, L, VOL, CS, k, hotel, eta=eta) for v in SPEEDS)


def main():
    q = lambda xs, p: sorted(xs)[int(p * (len(xs) - 1))]
    print(f"REMUS-class AUV: L {L} m, D {D} m, mass {MASS} kg, V {VOL*1000:.1f} L, c_s {CS:.2f}")
    glider = []
    gkeys = [k for k in GRID if k != 'auv']
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        glider.append((glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])[0], c['hotel']))
    print(f"glider cases {len(glider)} (4b grid, own hotel 0.7 to 5 W)")
    allw, all_h = [], []
    for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL):
        pp = prop_w(k, eta)
        h = pt - pp
        all_h.append(h)
        eb = auv_best(k, eta, h)
        wins = sum(e_g < eb for e_g, _ in glider)
        allw.append(wins / len(glider))
        print(f"k {k:.1f} eta {eta:.2f} P_total {pt:5.0f} W: propulsion@1.5 {pp:5.1f} W, implied hotel {h:6.1f} W, "
              f"AUV best {eb:5.1f} J/m ({1500 * 3600 / eb / 1e3:6.0f} km on 1.5 kWh), glider longer in {100*wins/len(glider):5.1f}%")
    print(f"implied hotel W: min {min(all_h):.1f}, median {statistics.median(all_h):.1f}, max {max(all_h):.1f} over {len(all_h)} AUV cases")
    print(f"glider longer best range: min {100*min(allw):.1f}%, median {100*statistics.median(allw):.1f}%, max {100*max(allw):.1f}%")
    ratios = [auv_best(0.2, 0.55 * 0.85, h) / e_g for e_g, _ in glider for h in (all_h[0],)]
    print(f"AUV/glider energy-per-metre at k 0.2, low-efficiency, P_total 125 W: median {statistics.median(ratios):.2f}")


if __name__ == "__main__":
    main()
