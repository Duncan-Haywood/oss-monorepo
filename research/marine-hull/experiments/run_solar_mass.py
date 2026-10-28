"""Milestone 5d: panel mass charged to the battery; best array area.

    PYTHONPATH=src python3 experiments/run_solar_mass.py > experiments/results_solar_mass.txt
"""
import itertools
import math
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import battery_after_panels, deck_area, harvest_power, range_km_solar

M, FB, E_BATT = 200.0, 0.25, 200.0
AXES = dict(
    length=[3.0, 4.0, 5.0], c_s=[2.6, 3.0, 3.4], k_form=[0.10, 0.25, 0.40], wave=[0.0, 0.5, 1.0],
    hotel=[20.0, 30.0, 40.0], eta_pv=[0.15, 0.20, 0.23], derate=[0.70, 0.85], insol=[120.0, 180.0, 240.0],
)
AREAL = [2.0, 5.0, 10.0]
FRACS = [0.0, 0.25, 0.5, 0.75, 1.0]
VOL = M / RHO_SEA
WH = M * FB * E_BATT
SPEEDS = [i / 20.0 for i in range(10, 61)]


def best(wh, length, c_s, k, wave, hotel, p_sol):
    loads = [(v, power_total(v, resistance(v, length, VOL, c_s, k, wave_scale=wave), p_hotel=hotel)) for v in SPEEDS]
    return max(range_km_solar(wh, v, p, p_sol) for v, p in loads), loads


res = {a: dict(full=0, fin_full=0, n=0, neutral1=0, gain=[], bestfrac={f: 0 for f in FRACS}) for a in AREAL}
for length, c_s, k, wave, hotel, eta, der, ins in itertools.product(*AXES.values()):
    deck = deck_area(length)
    _, loads = best(WH, length, c_s, k, wave, hotel, 0.0)
    p1 = dict(loads)[1.0]
    base = max(range_km_solar(WH, v, p, 0.0) for v, p in loads)
    for a in AREAL:
        r = res[a]
        r["n"] += 1
        best_r, best_f = -1.0, 0.0
        for f in FRACS:
            area = f * deck
            wh = battery_after_panels(WH, area, a, E_BATT)
            p_sol = harvest_power(area, eta, der, ins)
            rng = max(range_km_solar(wh, v, p, p_sol) for v, p in loads)
            if rng > best_r * (1 + 1e-12):
                best_r, best_f = rng, f
        r["bestfrac"][best_f] += 1
        r["full"] += best_f == 1.0
        r["neutral1"] += harvest_power(deck, eta, der, ins) >= p1
        if not math.isinf(best_r):
            r["fin_full"] += best_f == 1.0
            r["gain"].append(best_r / base)

for a in AREAL:
    r = res[a]
    n = r["n"]
    g = sorted(r["gain"])
    print(f"areal mass {a} kg/m2: cases {n}")
    print(f"  full deck is best array: {r['full']} ({100*r['full']/n:.1f}%)")
    print(f"  among finite-range cases, full deck is best: {r['fin_full']} of {len(g)} ({100*r['fin_full']/len(g):.1f}%); other winners are ties at unbounded range")
    print("  best area fraction share: " + ", ".join(f"{f}: {100*c/n:.1f}%" for f, c in r["bestfrac"].items()))
    print(f"  energy-neutral at 1 m/s with full deck: {r['neutral1']} ({100*r['neutral1']/n:.1f}%)")
    print(f"  finite-range cases {len(g)}; best-array range / no-array range: "
          f"10th {g[len(g)//10]:.2f} median {g[len(g)//2]:.2f} 90th {g[9*len(g)//10]:.2f}")
