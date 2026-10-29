"""Milestone 6c: does the gain of a back-off policy change when rough days come in spells (two-state Markov) and the pack is small?

    PYTHONPATH=src python3 experiments/run_solar_seastate_spells.py > experiments/results_solar_seastate_spells.txt
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
PS, FS, SPELLS = (0.3, 0.5), (3.0,), (1.0, 3.0, 7.0)


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


def run(harv, rough, vc, vr, F):
    """mean km/day when speed is vc on calm days and vr on rough days (rough days see multiplier F)"""
    soc, km = PACK_WH, 0.0
    for e_h, r in zip(harv, rough):
        v, need = (vr, NEED[(vr, F)]) if r else (vc, NEED[(vc, 1.0)])
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
                    res[(site, pack, p, sp, F)] = (a, b, c)
                    print(f"{site:16s} pack {pack:5s} p={p} spell={sp:.0f}d (rough share {sum(rough)/len(rough):.2f}) F={F}: A {a:6.1f} | B {b:6.1f} (v {SPEEDS[ib]:.1f}) | C {c:6.1f} (calm {pair[0]:.1f}, rough {pair[1]:.1f}) | C/B {c/b-1:+.1%} | B/A {b/a-1:+.1%}")
for pack in PACKS:
    for p in PS:
        for sp in SPELLS:
            g = [res[(s_, pack, p, sp, 3.0)][2] / res[(s_, pack, p, sp, 3.0)][1] - 1 for s_ in ORDER]
            print(f"pack {pack} p={p} spell={sp:.0f}d: C/B over sites min {min(g):+.1%} max {max(g):+.1%}")
for pol, name in ((0, "A"), (1, "B"), (2, "C")):
    ok = all(res[(ORDER[i], k[1], k[2], k[3], k[4])][pol] >= res[(ORDER[i + 1], k[1], k[2], k[3], k[4])][pol] for i in range(4) for k in res if k[0] == ORDER[0])
    print(f"site ordering holds under policy {name} in every cell: {ok}")
