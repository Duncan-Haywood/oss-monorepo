"""Milestone 6f: persistence on an iid (spell 2) and 3-day chain as well as 7 days;  (tomorrow's sea state = today's, no skill parameter) against the best constant speed B and the oracle C.

    PYTHONPATH=src python3 experiments/run_solar_seastate_persist_iid.py > experiments/results_solar_seastate_persist_iid.txt
"""
import json
import os
import random
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
PACKS = {"10kWh": 0.25 * M * 200.0, "1kWh": 1000.0}
PACK_WH = PACKS["10kWh"]
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))
SPEEDS = [round(0.5 + 0.1 * i, 1) for i in range(16)]
HOTEL, ETA, DERATE, L = 10.0, 0.20, 0.85, 5.0
PS, FS, SPELLS = (0.5,), (3.0,), (2.0, 3.0, 7.0)


def need_wh(v, f):
    return power_total(v, f * resistance(v, L, VOL, 3.0, 0.25, wave_scale=1.0), p_hotel=HOTEL) * 24.0


def markov(u, p, spell):
    """rough/calm chain with stationary rough share p and mean rough-spell length `spell` days (1 = iid)"""
    stay = 1.0 - 1.0 / spell
    enter = min(1.0, p / (1.0 - p) / spell)
    out, r = [], u[0] < p
    for x in u:
        r = (x < stay) if r else (x < enter)
        out.append(r)
    return out


def run(harv, rough, vc, vr, F, fc=None):
    """mean km/day when speed is vc on calm days and vr on rough days (rough days see multiplier F)"""
    soc, km = PACK_WH, 0.0
    fc = rough if fc is None else fc
    for e_h, r, g in zip(harv, rough, fc):
        v = vr if g else vc  # speed chosen on the forecast; energy use follows the true state
        need = NEED[(v, F)] if r else NEED[(v, 1.0)]
        if soc + e_h >= need:
            soc = min(PACK_WH, soc + e_h - need)
            km += v * 86.4
        else:
            km += max(0.0, (soc + e_h) / need) * v * 86.4
            soc = 0.0
    return km / len(harv)


NEED = {(v, f): need_wh(v, f) for v in SPEEDS for f in (1.0,) + FS}
A = deck_area(L)
print(f"5 m boat, hotel {HOTEL} W, eta_pv {ETA}, derate {DERATE}; rough share p, multiplier F; seed 1")
res = {}
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    harv = [harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) * 24.0 for d in days]
    rng = random.Random(1)
    u = [rng.random() for _ in days]
    for pack, wh in PACKS.items():
        PACK_WH = wh
        calm_tab = [run(harv, [False] * len(days), v, v, 1.0) for v in SPEEDS]
        vA = SPEEDS[max(range(len(SPEEDS)), key=calm_tab.__getitem__)]
        for p in PS:
            for sp in SPELLS:
                rough = markov(u, p, sp)
                for F in FS:
                    a = run(harv, rough, vA, vA, F)
                    tb = [run(harv, rough, v, v, F) for v in SPEEDS]
                    ib = max(range(len(SPEEDS)), key=tb.__getitem__)
                    b = tb[ib]
                    c, pair = max(((run(harv, rough, vc, vr, F), (vc, vr)) for vc in SPEEDS for vr in SPEEDS), key=lambda t: t[0])
                    fc = [False] + rough[:-1]  # persistence: today's call is yesterday's true state
                    e = max(run(harv, rough, vc, vr, F, fc) for vc in SPEEDS for vr in SPEEDS)
                    hit = sum(x == y for x, y in zip(fc, rough)) / len(rough)
                    res[(site, pack, p, sp, F)] = (a, b, c, e)
                    sh = (e - b) / (c - b) if c > b else float("nan")
                    print(f"{site:16s} pack {pack:5s} spell={sp:.0f}d: A {a:6.1f} B {b:6.1f} C {c:6.1f} (C/B {c/b-1:+.1%}) E {e:6.1f} (E/B {e/b-1:+.1%}) hit rate {hit:.2f} share of C-B gap {sh:+.2f}")
for sp in SPELLS:
    v = sorted((e - b) / (c - b) for (si, pk, p, s_, F), (a, b, c, e) in res.items() if s_ == sp)
    print(f"spell {sp:.0f}d: share of C-B gap captured by persistence, median {v[len(v)//2]:+.2f}, min {v[0]:+.2f}, max {v[-1]:+.2f}; cells with E < B: {sum(x < -1e-9 for x in v)}")
print("cells with E < B overall:", sum(e < b - 1e-9 for (a, b, c, e) in res.values()), "of", len(res))
