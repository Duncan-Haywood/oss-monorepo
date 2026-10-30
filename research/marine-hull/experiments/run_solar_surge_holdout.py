"""Milestone 5i: does 5h's surge rule survive a held-out half of the decade, on a grid wide enough to have an interior optimum?

    PYTHONPATH=src python3 experiments/run_solar_surge_holdout.py > experiments/results_solar_surge_holdout.txt
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
CONST = [round(0.6 + 0.1 * i, 1) for i in range(12)]            # 0.6 .. 1.7
V_FAST = [round(1.2 + 0.2 * i, 1) for i in range(9)]            # 1.2 .. 2.8 (5h stopped at 1.6)
LEVELS = [0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99]                 # 5h stopped at 0.99 and started at 0.7


def load_w(L, v):
    return power_total(v, resistance(v, L, VOL, C_S, K_FORM, wave_scale=WAVE), p_hotel=HOTEL)


def run(harv, L, v_base, v_fast, level):
    """As 5h: daily steps from a full pack; v_fast while the pack is above `level` of capacity, else v_base.
    A day the energy cannot cover runs only the fraction it lasts. Fixed speed is v_fast == v_base."""
    p_b, p_f = load_w(L, v_base), load_w(L, v_fast)
    soc, km = PACK_WH, 0.0
    for h in harv:
        v, p = (v_fast, p_f) if soc > level * PACK_WH else (v_base, p_b)
        e_h, need = h * 24.0, p * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
        km += frac * v * 86.4
    return km / len(harv)


def fit(harv, L):
    """Best fixed speed and best (v_base, v_fast, level) surge rule on this series."""
    cv = max(CONST, key=lambda v: run(harv, L, v, v, 0.0))
    best = max(((run(harv, L, vb, vf, lv), vb, vf, lv) for vb in (0.8, 1.0) for vf in V_FAST for lv in LEVELS))
    return cv, best


ge3, n_cases, interior, rows = 0, 0, 0, []
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    for L in (4.0, 5.0):
        A = deck_area(L)
        harv = {d: harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) for d in days}
        halves = {"A": [harv[d] for d in days if d < "2020"], "B": [harv[d] for d in days if d >= "2020"]}
        for fit_k, test_k in (("A", "B"), ("B", "A")):
            cv, (_, vb, vf, lv) = fit(halves[fit_k], L)
            surge = run(halves[test_k], L, vb, vf, lv)
            const = run(halves[test_k], L, cv, cv, 0.0)
            fixed1 = run(halves[test_k], L, 1.0, 1.0, 0.0)
            oracle = max(run(halves[test_k], L, b, f, l) for b in (0.8, 1.0) for f in V_FAST for l in LEVELS)
            n_cases += 1
            edge = vf in (V_FAST[0], V_FAST[-1]) or lv in (LEVELS[0], LEVELS[-1])
            interior += not edge
            ge3 += surge >= 1.03 * const
            print(f"{site:16s} {L:.0f} m fit {fit_k}->test {test_k}: rule ({vb:.1f} base, {vf:.1f} fast above {100 * lv:.0f}%){' [edge]' if edge else ''}; "
                  f"test km/day: fixed1.0 {fixed1:5.1f}, best-const-from-fit ({cv:.1f}) {const:5.1f}, surge {surge:5.1f} ({100 * (surge / const - 1):+.1f}% vs const), "
                  f"same-half oracle surge {oracle:5.1f} (regret {100 * (1 - surge / oracle):.1f}%)")
print(f"fit-half optimum interior to the widened grid in {interior}/{n_cases} fits")
print(f"held-out surge beats held-out-evaluated best-const-from-fit by >=3% in {ge3}/{n_cases} fits")
