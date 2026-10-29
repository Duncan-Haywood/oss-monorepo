"""Milestone 5l: deck-solar boat km/day with the hotel load and panel yield taken from published figures.

    PYTHONPATH=src python3 experiments/run_solar_sourced_inputs.py > experiments/results_solar_sourced_inputs.txt

Sourced ranges (see LOG.md 5l): hotel 5, 10, 25 W (Liquid Robotics Wave Glider average continuous power 5 to 25 W;
10 W is the US Navy 24/7 instrumentation requirement quoted in the same search); panel efficiency 0.20 and 0.226
(Maxeon 3 module datasheet, up to 22.6%); temperature derate from Pmax coefficient -0.27 %/degC at 45 degC cell.
The non-temperature loss (soiling, mismatch, wiring) has no source: swept at 0.90 and 0.95.
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
TEMP = 1 - 0.0027 * (45 - 25)  # 0.946
HOTELS = (5.0, 10.0, 25.0)
ETAS = (0.20, 0.226)
OTHER = (0.90, 0.95)


def km_per_day(daily, days, L, v, hotel, eta, derate):
    A = deck_area(L)
    need = power_total(v, resistance(v, L, VOL, 3.0, 0.25, wave_scale=1.0), p_hotel=hotel) * 24.0
    soc, km = PACK_WH, 0.0
    for d in days:
        e_h = harvest_power(A, eta, derate, daily[d] * 1000.0 / 24.0) * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
        km += frac * v * 86.4
    return km / len(days)


def best(daily, days, L, **p):
    tab = [km_per_day(daily, days, L, v, **p) for v in SPEEDS]
    i = max(range(len(SPEEDS)), key=tab.__getitem__)
    return SPEEDS[i], tab[i]


print(f"temperature factor at 45 C cell, -0.27 %/C: {TEMP:.3f}")
sw = {}
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    for L in (4.0, 5.0):
        print(f"{site} {L:.0f} m (eta 0.20, other loss 0.90): " + "; ".join(
            "hotel %g W: %.1f m/s %.1f km/day" % ((h,) + best(daily, days, L, hotel=h, eta=0.20, derate=TEMP * 0.90)) for h in HOTELS))
        res = {(h, e, o): best(daily, days, L, hotel=h, eta=e, derate=TEMP * o) for h in HOTELS for e in ETAS for o in OTHER}
        ks = [r[1] for r in res.values()]
        vs = [r[0] for r in res.values()]
        lo, hi = min(res.items(), key=lambda t: t[1][1]), max(res.items(), key=lambda t: t[1][1])
        by_h = {h: [r[1] for k, r in res.items() if k[0] == h] for h in HOTELS}
        sw[(site, L)] = (min(ks), max(ks), min(vs), max(vs), by_h)
        print(f"    all 12 combos: km/day {min(ks):.1f} to {max(ks):.1f} (ratio {max(ks)/min(ks):.2f}); best speed {min(vs):.1f} to {max(vs):.1f}; "
              f"hotel 5 W vs 25 W mean km/day {sum(by_h[5.0])/4:.1f} vs {sum(by_h[25.0])/4:.1f} "
              f"({100*(sum(by_h[5.0])/sum(by_h[25.0])-1):+.0f}%)")
