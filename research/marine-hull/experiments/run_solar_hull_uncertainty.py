"""Milestone 5j: does the best constant speed of a deck-solar boat survive the unsourced hull constants?

    PYTHONPATH=src python3 experiments/run_solar_hull_uncertainty.py > experiments/results_solar_hull_uncertainty.txt
"""
import itertools
import json
import os
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
HOTEL, ETA, DERATE = 30.0, 0.20, 0.85
PACK_WH = 0.25 * M * 200.0
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))
SPEEDS = [round(0.5 + 0.1 * i, 1) for i in range(16)]           # 0.5 .. 2.0
BOX = list(itertools.product((2.6, 3.0, 3.4), (0.10, 0.25, 0.40), (0.0, 0.5, 1.0)))
CENTRE = (3.0, 0.25, 1.0)


def km_per_day(harv, L, v, hull):
    """Fixed speed v from a full pack; a day the energy cannot cover runs only the fraction it lasts (as 5h/5i)."""
    c_s, k, w = hull
    need = power_total(v, resistance(v, L, VOL, c_s, k, wave_scale=w), p_hotel=HOTEL) * 24.0
    soc, km = PACK_WH, 0.0
    for h in harv:
        e_h = h * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
        km += frac * v * 86.4
    return km / len(harv)


n_cases = n_span3 = n_ge5 = n_mm_ge3 = 0
worst_c = worst_m = 0.0
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    for L in (4.0, 5.0):
        A = deck_area(L)
        harv = [harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) for d in days]
        tab = {hull: [km_per_day(harv, L, v, hull) for v in SPEEDS] for hull in BOX}
        best_i = {hull: max(range(len(SPEEDS)), key=lambda i: tab[hull][i]) for hull in BOX}
        vbest = [SPEEDS[best_i[h]] for h in BOX]
        ci = best_i[CENTRE]
        regret_c = max(1 - tab[h][ci] / tab[h][best_i[h]] for h in BOX)
        mm_i = min(range(len(SPEEDS)), key=lambda i: max(1 - tab[h][i] / tab[h][best_i[h]] for h in BOX))
        regret_m = max(1 - tab[h][mm_i] / tab[h][best_i[h]] for h in BOX)
        span = max(vbest) - min(vbest)
        n_cases += 1
        n_span3 += span >= 0.3 - 1e-9 and L == 5.0
        n_ge5 += regret_c >= 0.05
        n_mm_ge3 += regret_m >= 0.03
        worst_c, worst_m = max(worst_c, regret_c), max(worst_m, regret_m)
        print(f"{site:16s} {L:.0f} m: best speed over 27 hulls {min(vbest):.1f} to {max(vbest):.1f} m/s (span {span:.1f}), "
              f"centre hull {SPEEDS[ci]:.1f} m/s = {tab[CENTRE][ci]:5.1f} km/day; "
              f"centre speed worst regret {100 * regret_c:.1f}%; minimax speed {SPEEDS[mm_i]:.1f} m/s worst regret {100 * regret_m:.1f}%; "
              f"km/day at own best over box {min(tab[h][best_i[h]] for h in BOX):.1f} to {max(tab[h][best_i[h]] for h in BOX):.1f}")
print(f"prediction 1: 5 m span >= 0.3 m/s at {n_span3}/5 sites")
print(f"prediction 2: centre-hull speed regret >= 5% in {n_ge5}/{n_cases} cases (worst {100 * worst_c:.1f}%)")
print(f"prediction 3: minimax regret >= 3% in {n_mm_ge3}/{n_cases} cases (worst {100 * worst_m:.1f}%)")
