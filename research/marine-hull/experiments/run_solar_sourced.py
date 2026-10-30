"""Milestone 5l: best speed and km/day with the hotel load and panel efficiency from published figures

    PYTHONPATH=src python3 experiments/run_solar_sourced.py > experiments/results_solar_sensitivity.txt
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


HOTELS = (5.0, 10.0, 20.0, 30.0)
ETAS = (0.17, 0.22)
res = {}
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    for L in (4.0, 5.0):
        v0, k0 = best(daily, days, L, CENTRE)
        print(f"{site:16s} {L:.0f} m: 5k centre (30 W, eta 0.20) best {v0:.1f} m/s, {k0:5.1f} km/day")
        for h in HOTELS:
            for e in ETAS:
                p = dict(CENTRE); p["hotel"] = h; p["eta"] = e
                v, k = best(daily, days, L, p)
                res[(site, L, h, e)] = (v, k, v0, k0)
                print(f"    hotel {h:4.0f} W eta {e:.2f}: best {v:.1f} m/s ({v - v0:+.1f}), {k:6.1f} km/day ({k / k0:.2f}x centre)")
lim = ("Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska")
d1 = [(s, res[(s, 5.0, 10.0, 0.17)][0] - res[(s, 5.0, 30.0, 0.17)][0]) for s in lim]
print("prediction 1: 5 m best-speed shift 30 W -> 10 W (eta 0.17):", [(s, round(d, 1)) for s, d in d1])
r2 = [(s, round(res[(s, 5.0, 10.0, 0.22)][1] / res[(s, 5.0, 10.0, 0.22)][3], 2)) for s in lim]
print("prediction 2: 5 m km/day, 10 W & eta 0.22, over 5k centre:", r2)
bad = 0
for L in (4.0, 5.0):
    for h in HOTELS:
        for e in ETAS:
            order = sorted(ORDER, key=lambda s: -res[(s, L, h, e)][1])
            if order != ORDER:
                bad += 1
                print(f"prediction 3: reorder at {L:.0f} m hotel {h:g} eta {e}: {order}")
print(f"prediction 3: cells with a reordered site ranking: {bad} of 16")
