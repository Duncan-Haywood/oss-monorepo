"""Milestone 5m: km/day and best speed with the power-side inputs drawn jointly from their ranges

    PYTHONPATH=src python3 experiments/run_solar_mc.py > experiments/results_solar_mc.txt
"""
import json
import os
import random
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
PACK_WH = 0.25 * M * 200.0
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))
SPEEDS = [round(0.5 + 0.1 * i, 1) for i in range(16)]
RANGES = dict(hotel=(5.0, 20.0), eta=(0.17, 0.22), temp=(0.93, 1.00), soil=(0.90, 0.99), elec=(0.92, 0.97))
N, SEED = 500, 1


def km_per_day(daily, days, L, v, hotel, eta, derate):
    A = deck_area(L)
    need = power_total(v, resistance(v, L, VOL, 3.0, 0.25, wave_scale=1.0), p_hotel=hotel) * 24.0
    soc, km = PACK_WH, 0.0
    for d in days:
        e_h = harvest_power(A, eta, derate, daily[d] * 1000.0 / 24.0) * 24.0
        if soc + e_h >= need:
            soc = min(PACK_WH, soc + e_h - need)
            km += v * 86.4
        else:
            km += max(0.0, (soc + e_h) / need) * v * 86.4
            soc = 0.0
    return km / len(days)


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


rng = random.Random(SEED)
draws = []
for _ in range(N):
    r = {k: rng.uniform(*v) for k, v in RANGES.items()}
    draws.append((r["hotel"], r["eta"], r["temp"] * r["soil"] * r["elec"]))
print(f"{N} joint uniform draws, seed {SEED}; ranges {RANGES}")
print(f"derate (product) range of the draws: {min(d[2] for d in draws):.3f} to {max(d[2] for d in draws):.3f}")
out = {}
for L in (4.0, 5.0):
    for site in ORDER:
        daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        days = sorted(k for k, v in daily.items() if v > -900)
        ks, vs = [], []
        for h, e, dr in draws:
            tab = [km_per_day(daily, days, L, v, h, e, dr) for v in SPEEDS]
            i = max(range(len(SPEEDS)), key=tab.__getitem__)
            ks.append(tab[i]); vs.append(SPEEDS[i])
        out[(L, site)] = (ks, vs)
        med = pct(ks, 0.5)
        print(f"{L:.0f} m {site:16s} km/day median {med:6.1f} (5%-95%: {pct(ks, .05):6.1f} to {pct(ks, .95):6.1f}; {pct(ks, .05)/med-1:+.0%} / {pct(ks, .95)/med-1:+.0%}); best speed median {pct(vs, .5):.1f} ({pct(vs, .05):.1f} to {pct(vs, .95):.1f})")
for L in (4.0, 5.0):
    ok = sum(all(out[(L, ORDER[i])][0][j] >= out[(L, ORDER[i + 1])][0][j] for i in range(4)) for j in range(N))
    print(f"{L:.0f} m: draws with the site ordering Equator>Florida>Maine>North Sea>Alaska: {ok} of {N} ({ok / N:.1%})")
