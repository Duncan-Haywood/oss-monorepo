"""Milestone 4f: glider against AUV in a steady cross-current, energy per ground metre.

Run: PYTHONPATH=src:experiments python3 experiments/run_current.py > experiments/results_current.txt
A vehicle with through-water speed u crabs into a perpendicular current v and makes good
sqrt(u^2 - v^2) along the track; u <= v cannot hold it. Energy per ground metre is
(E/m)(u) * u / sqrt(u^2 - v^2). The glider keeps its glide speed (the 4b grid holds fast and
slow gliders); the AUV re-optimises its speed at each v. Currents are swept, not sourced.
"""
import itertools
import math
import statistics
from marine_hull.glider import auv_energy_per_m
from run_slocum import GRID, glider_best
from run_remus import L, VOL, CS, P_TOTAL, FORM, ETA, prop_w

AUV_SPEEDS = [0.1 + 0.05 * i for i in range(45)]
CURRENTS = [0.05 * i for i in range(11)]


def ground(e_m, u, v):
    return e_m * u / math.sqrt(u * u - v * v) if u > v else math.inf


def main():
    gkeys = [k for k in GRID if k != 'auv']
    glider = []
    for vals in itertools.product(*(GRID[k] for k in gkeys)):
        c = dict(zip(gkeys, vals))
        e, uh, _ = glider_best(c['cd0'], c['b_max'], c['eta_pump'], c['e_cycle'], c['hotel'])
        glider.append((e, uh))
    auvs = []
    for k, eta, pt in itertools.product(FORM, ETA, P_TOTAL):
        auvs.append((k, eta, pt - prop_w(k, eta)))
    print(f"glider cases {len(glider)}, AUV cases {len(auvs)}; median glide speed {statistics.median(u for _, u in glider):.3f} m/s")
    print("v_c m/s | glider stalled % | AUV median J/ground-m | glider wins % of all pairs | glider wins % of pairs with glider holding track")
    for v in CURRENTS:
        stalled = sum(u <= v for _, u in glider)
        ae = []
        for k, eta, h in auvs:
            ae.append(min(ground(auv_energy_per_m(u, L, VOL, CS, k, h, eta=eta), u, v) for u in AUV_SPEEDS))
        wins = held = held_wins = 0
        for eg, ug in glider:
            g = ground(eg, ug, v)
            for a in ae:
                wins += g < a
                if g < math.inf:
                    held += 1
                    held_wins += g < a
        tot = len(glider) * len(ae)
        hw = f"{100*held_wins/held:.1f}" if held else "n/a"
        print(f"{v:.2f} | {100*stalled/len(glider):.1f} | {statistics.median(ae):.0f} | {100*wins/tot:.1f} | {hw}")


if __name__ == "__main__":
    main()
