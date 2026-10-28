"""Milestone 5h: threshold and speed sweep, and a perfect-forecast upper bound, for the 5g boat.

    PYTHONPATH=src python3 experiments/run_solar_policy_bound.py > experiments/results_solar_policy_bound.txt
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
V_MAX = 3.0
CONST = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]
THRESH = [0.10, 0.20, 0.30, 0.50]
SLOW = [0.3, 0.5, 0.7, 0.9]


def load_w(L, v):
    return power_total(v, resistance(v, L, VOL, C_S, K_FORM, wave_scale=WAVE), p_hotel=HOTEL) if v > 0 else HOTEL


def simulate(harv, L, v_hi, v_lo, thresh):
    """As 5g: daily steps from a full pack; a day the energy cannot cover runs only the fraction it lasts."""
    p_hi, p_lo = load_w(L, v_hi), load_w(L, v_lo)
    soc, km, dead = PACK_WH, 0.0, 0
    for h in harv:
        v, p = (v_lo, p_lo) if soc < thresh * PACK_WH else (v_hi, p_hi)
        e_h, need = h * 24.0, p * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
            dead += 1
        km += frac * v * 86.4
    return km / len(harv), dead / len(harv)


def simulate_surge(harv, L, v_base, v_fast, full):
    """Exploratory (added after seeing the first results): v_fast while the pack is above `full` of capacity, else v_base."""
    p_b, p_f = load_w(L, v_base), load_w(L, v_fast)
    soc, km = PACK_WH, 0.0
    for h in harv:
        v, p = (v_fast, p_f) if soc > full * PACK_WH else (v_base, p_b)
        e_h, need = h * 24.0, p * 24.0
        if soc + e_h >= need:
            frac, soc = 1.0, min(PACK_WH, soc + e_h - need)
        else:
            frac, soc = max(0.0, (soc + e_h) / need), 0.0
        km += frac * v * 86.4
    return km / len(harv)


def bound_kmd(harv, L):
    """Upper bound for any schedule under the simulator's convention (a stopped boat draws nothing): distance is the
    upper concave hull of {(0,0)} and {(24 P(v), 86.4 v)}, evaluated at the pooled energy per day.
    Below the energy of the best-range speed v* the hull is the line from the origin (duty-cycle at v*); above it
    the hull is the curve itself (one constant speed, found by bisection)."""
    e_day = (PACK_WH + 24.0 * sum(harv)) / len(harv)
    vs = [0.02 * i for i in range(1, int(V_MAX / 0.02) + 1)]
    v_star = max(vs, key=lambda v: v / load_w(L, v))
    if e_day <= 24.0 * load_w(L, v_star):
        return 86.4 * v_star * e_day / (24.0 * load_w(L, v_star)), v_star
    if load_w(L, V_MAX) * 24.0 <= e_day:
        return V_MAX * 86.4, V_MAX
    lo, hi = v_star, V_MAX
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if 24.0 * load_w(L, mid) <= e_day else (lo, mid)
    return lo * 86.4, lo


fails1, fails2, n2, over = [], [], 0, []
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    print(f"{site}: {len(days)} days")
    for L in (4.0, 5.0):
        A = deck_area(L)
        harv = [harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) for d in days]
        fixed = {v: simulate(harv, L, v, v, 0.0) for v in CONST}
        best_v = max(fixed, key=lambda v: fixed[v][0])
        pol = {(t, s): simulate(harv, L, 1.0, s, t) for t in THRESH for s in SLOW}
        best_pol = max(pol, key=lambda k: pol[k][0])
        bkm, bv = bound_kmd(harv, L)
        f1, dead1 = fixed[1.0]
        print(f"  {L:.0f} m fixed 1.0: {f1:5.1f} km/day (empty {100 * dead1:4.1f}%); best constant {best_v:.1f} m/s: {fixed[best_v][0]:5.1f}; "
              f"best threshold policy (<{100 * best_pol[0]:.0f}% -> {best_pol[1]:.1f} m/s): {pol[best_pol][0]:5.1f}; "
              f"perfect-forecast bound {bkm:5.1f} (v* or constant {bv:.2f} m/s, {100 * (bkm / f1 - 1):+.0f}% vs fixed 1.0)")
        surge = max(((simulate_surge(harv, L, 1.0, vf, fu), vf, fu) for vf in (1.2, 1.4, 1.6) for fu in (0.7, 0.9, 0.99)))
        print(f"       exploratory surge (1.0 m/s, faster while pack above a level): best {surge[0]:5.1f} km/day at {surge[1]:.1f} m/s above {100 * surge[2]:.0f}%")
        if max(f[0] for f in fixed.values()) > bkm * 1.0001 or pol[best_pol][0] > bkm * 1.0001:
            over.append((site, L))
        if pol[best_pol][0] > 1.01 * fixed[best_v][0]:
            fails1.append((site, L))
        if dead1 >= 0.05:
            n2 += 1
            if bkm >= 1.10 * f1:
                fails2.append((site, L, round(bkm / f1 - 1, 3)))
print(f"prediction 1 refuted in: {fails1 or 'none'}")
print(f"prediction 2 ({n2} energy-limited cases) refuted in: {fails2 or 'none'}")
print(f"simulated distance above the bound in: {[x for x in over] or 'none'}")
