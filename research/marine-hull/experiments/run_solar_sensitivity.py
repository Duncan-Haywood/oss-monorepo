"""Milestone 5k: which of the six inputs moves a deck-solar boat's best cruise speed and km/day most?

    PYTHONPATH=src python3 experiments/run_solar_sensitivity.py > experiments/results_solar_sensitivity.txt
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
CENTRE = dict(c_s=3.0, k=0.25, wave=1.0, hotel=30.0, eta=0.20, derate=0.85)
RANGES = {"c_s": (2.6, 3.4), "k_form": (0.10, 0.40), "wave": (0.5, 1.0), "hotel": (20.0, 45.0),
          "eta_pv": (0.17, 0.23), "derate": (0.75, 0.95)}
KEY = {"c_s": "c_s", "k_form": "k", "wave": "wave", "hotel": "hotel", "eta_pv": "eta", "derate": "derate"}


def km_per_day(daily, days, L, v, p):
    A = deck_area(L)
    need = power_total(v, resistance(v, L, VOL, p["c_s"], p["k"], wave_scale=p["wave"]), p_hotel=p["hotel"]) * 24.0
    soc, km = PACK_WH, 0.0
    for d in days:
        e_h = harvest_power(A, p["eta"], p["derate"], daily[d] * 1000.0 / 24.0) * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
        km += frac * v * 86.4
    return km / len(days)


def best(daily, days, L, p):
    tab = [km_per_day(daily, days, L, v, p) for v in SPEEDS]
    i = max(range(len(SPEEDS)), key=tab.__getitem__)
    return SPEEDS[i], tab[i]


top = {}
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    for L in (4.0, 5.0):
        v0, k0 = best(daily, days, L, CENTRE)
        rows = []
        for name, (lo, hi) in RANGES.items():
            res = []
            for val in (lo, hi):
                p = dict(CENTRE); p[KEY[name]] = val
                res.append(best(daily, days, L, p))
            swing = 100 * (res[1][1] - res[0][1]) / k0
            rows.append((abs(swing), name, swing, res[0][0], res[1][0], max(abs(r[0] - v0) for r in res)))
        rows.sort(reverse=True)
        top[(site, L)] = rows
        print(f"{site:16s} {L:.0f} m: centre best {v0:.1f} m/s, {k0:5.1f} km/day")
        for _, name, swing, vl, vh, dv in rows:
            print(f"    {name:7s} {RANGES[name][0]:g}..{RANGES[name][1]:g}: km/day swing {swing:+6.1f}% of centre; best speed {vl:.1f} to {vh:.1f} (max shift from centre {dv:.1f})")
p1 = [top[(s, 5.0)][0][1] for s in ("Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska")]
print(f"prediction 1: largest 5 m km/day swing at Gulf of Maine, North Sea, Gulf of Alaska is {p1}")
print(f"prediction 2: largest 5 m km/day swing at Equator is {top[('Equator-Pacific', 5.0)][0][1]}")
sh = max(r[5] for (s, L), rows in top.items() if L == 5.0 for r in rows if r[1] in ("eta_pv", "derate"))
print(f"prediction 3: max 5 m best-speed shift over eta_pv and derate ranges = {sh:.1f} m/s")
