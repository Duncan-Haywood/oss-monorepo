"""Milestone 5e: deck solar energy-neutrality at 1 m/s with NASA POWER monthly insolation at five sites.

    PYTHONPATH=src python3 experiments/run_solar_sites.py > experiments/results_solar_sites.txt
"""
import glob
import itertools
import json
import os
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
C_S, K_FORM, WAVE = 3.0, 0.25, 1.0
LENGTHS, HOTELS, ETAS, DERATES = [3.0, 4.0, 5.0], [20.0, 30.0, 40.0], [0.15, 0.20, 0.23], [0.70, 0.85]
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))

load = {(L, h): power_total(1.0, resistance(1.0, L, VOL, C_S, K_FORM, wave_scale=WAVE), p_hotel=h)
        for L in LENGTHS for h in HOTELS}


def neutral(L, h, eta, der, w_m2):
    return harvest_power(deck_area(L), eta, der, w_m2) >= load[(L, h)]


for site in ORDER:
    d = json.load(open(os.path.join(here, "data", f"power_{site}.json")))
    lon, lat, _ = d["geometry"]["coordinates"]
    kwh = d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    w = {m: kwh[m] * 1000.0 / 24.0 for m in MONTHS + ["ANN"]}
    print(f"{site} (lat {lat}, lon {lon}): annual mean {w['ANN']:.0f} W/m2, range {min(w[m] for m in MONTHS):.0f} to {max(w[m] for m in MONTHS):.0f}")
    cases = list(itertools.product(LENGTHS, HOTELS, ETAS, DERATES))
    shares = [100.0 * sum(neutral(*c, w[m]) for c in cases) / len(cases) for m in MONTHS]
    print("  neutral share of 54 boats by month: " + " ".join(f"{m[:1]}{m[1:3].lower()} {s:.0f}" for m, s in zip(MONTHS, shares)))
    for L in (4.0, 5.0):
        months = [m for m in MONTHS if neutral(L, 30.0, 0.20, 0.85, w[m])]
        print(f"  central {L:.0f} m boat (30 W, 0.20, 0.85; load {load[(L, 30.0)]:.1f} W, harvest at annual mean {harvest_power(deck_area(L), 0.20, 0.85, w['ANN']):.1f} W): "
              f"neutral in {len(months)} months; annual-mean verdict {'neutral' if neutral(L, 30.0, 0.20, 0.85, w['ANN']) else 'not neutral'}; "
              f"worst month {min(MONTHS, key=lambda m: w[m])} {'neutral' if neutral(L, 30.0, 0.20, 0.85, min(w[m] for m in MONTHS)) else 'not neutral'}")
