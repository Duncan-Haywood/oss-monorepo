"""Milestone 6a: km/day and best speed with a free multiplier on hull resistance (stand-in for sea-state added resistance)

    PYTHONPATH=src python3 experiments/run_solar_seastate.py > experiments/results_solar_seastate.txt
"""
import json
import os
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
PACK_WH = 0.25 * M * 200.0
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))
SPEEDS = [round(0.5 + 0.1 * i, 1) for i in range(16)]
HOTEL, ETA, DERATE = 10.0, 0.20, 0.85
FS = (1.0, 1.25, 1.5, 2.0, 3.0)


def km_per_day(daily, days, L, v, f):
    A = deck_area(L)
    need = power_total(v, f * resistance(v, L, VOL, 3.0, 0.25, wave_scale=1.0), p_hotel=HOTEL) * 24.0
    soc, km = PACK_WH, 0.0
    for d in days:
        e_h = harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) * 24.0
        if soc + e_h >= need:
            soc = min(PACK_WH, soc + e_h - need)
            km += v * 86.4
        else:
            km += max(0.0, (soc + e_h) / need) * v * 86.4
            soc = 0.0
    return km / len(days)


print(f"hotel {HOTEL} W, eta_pv {ETA}, derate {DERATE}; resistance multiplier f in {FS}")
best = {}
for L in (4.0, 5.0):
    for site in ORDER:
        daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        days = sorted(k for k, v in daily.items() if v > -900)
        tabs = {f: [km_per_day(daily, days, L, v, f) for v in SPEEDS] for f in FS}
        row = []
        for f in FS:
            i = max(range(len(SPEEDS)), key=tabs[f].__getitem__)
            best[(L, site, f)] = (SPEEDS[i], tabs[f][i])
            row.append(f"f={f}: {SPEEDS[i]:.1f} m/s {tabs[f][i]:6.1f} km/d ({tabs[f][i]/best[(L, site, 1.0)][1]:.0%})")
        j1 = SPEEDS.index(best[(L, site, 1.0)][0])
        reg = 1 - tabs[2.0][j1] / best[(L, site, 2.0)][1]
        print(f"{L:.0f} m {site:16s} " + " | ".join(row) + f" | regret of f=1 speed at f=2: {reg:.1%}")
for L in (4.0, 5.0):
    ok = [f for f in FS if all(best[(L, ORDER[i], f)][1] >= best[(L, ORDER[i + 1], f)][1] for i in range(4))]
    print(f"{L:.0f} m: site ordering holds at f in {ok} of {FS}")
