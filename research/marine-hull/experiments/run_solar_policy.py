"""Milestone 5g: a speed policy against the daily NASA POWER series, year-round, 2015 to 2024.

    PYTHONPATH=src python3 experiments/run_solar_policy.py > experiments/results_solar_policy.txt
"""
import json
import os
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
C_S, K_FORM, WAVE, HOTEL, ETA, DERATE = 3.0, 0.25, 1.0, 30.0, 0.20, 0.85
PACK_WH = 0.25 * M * 200.0
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))
LOW_SOC = 0.30  # fraction of pack below which the policy slows
# (name, speed above LOW_SOC, speed below it), m/s; speed 0 = hold station, hotel load only
POLICIES = [("fixed 1.0", 1.0, 1.0), ("slow 0.5 below 30%", 1.0, 0.5), ("hold below 30%", 1.0, 0.0)]


def load_w(L, v):
    return power_total(v, resistance(v, L, VOL, C_S, K_FORM, wave_scale=WAVE), p_hotel=HOTEL) if v > 0 else HOTEL


def simulate(harv, L, v_hi, v_lo):
    """Daily steps from a full pack. Returns km/day, share of days at zero pack, share of days below LOW_SOC.
    A day that would take the pack below zero runs only the fraction of the day the energy lasts, then stops."""
    p_hi, p_lo = load_w(L, v_hi), load_w(L, v_lo)
    soc, km, dead, low = PACK_WH, 0.0, 0, 0
    for h in harv:
        slow = soc < LOW_SOC * PACK_WH
        v, p = (v_lo, p_lo) if slow else (v_hi, p_hi)
        low += slow
        e_h = h * 24.0
        need = p * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
            dead += 1
        km += frac * v * 86.4
    return km / len(harv), dead / len(harv), low / len(harv)


for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    print(f"{site}: {len(days)} days")
    for L in (4.0, 5.0):
        A = deck_area(L)
        harv = [harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) for d in days]
        for name, hi, lo in POLICIES:
            kmd, dead, low = simulate(harv, L, hi, lo)
            print(f"  {L:.0f} m {name:20s}: {kmd:5.1f} km/day, pack-empty days {100 * dead:5.1f}%, slowed/held days {100 * low:5.1f}%")
