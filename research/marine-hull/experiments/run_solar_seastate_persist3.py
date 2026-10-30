"""Milestone 6g: persistence forecast with three sea states (calm, moderate, rough) against the best constant speed B and the oracle C.

    PYTHONPATH=src python3 experiments/run_solar_seastate_persist3.py > experiments/results_solar_seastate_persist3.txt
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
FS, SHARES, QS = (1.0, 1.5, 3.0), (0.4, 0.3, 0.3), (1.0, 0.5, 0.15)


def need_wh(v, f):
    return power_total(v, f * resistance(v, L, VOL, 3.0, 0.25, wave_scale=1.0), p_hotel=HOTEL) * 24.0


def chain(u1, u2, q):
    """state index per day: resampled from SHARES with probability q each day, else kept"""
    out, s = [], 0
    for i, (a, b) in enumerate(zip(u1, u2)):
        if i == 0 or a < q:
            s = 0 if b < SHARES[0] else (1 if b < SHARES[0] + SHARES[1] else 2)
        out.append(s)
    return out


def run(harv, state, speeds, call=None):
    """mean km/day; speed is speeds[call[t]] (default the true state), energy use follows the true state"""
    soc, km = PACK_WH, 0.0
    call = state if call is None else call
    for e_h, st, g in zip(harv, state, call):
        v = speeds[g]
        need = NEED[(v, FS[st])]
        if soc + e_h >= need:
            soc = min(PACK_WH, soc + e_h - need)
            km += v * 86.4
        else:
            km += max(0.0, (soc + e_h) / need) * v * 86.4
            soc = 0.0
    return km / len(harv)


NEED = {(v, f): need_wh(v, f) for v in SPEEDS for f in FS}
A = deck_area(L)
TRIPLES = [(a, b, c) for a in SPEEDS for b in SPEEDS for c in SPEEDS]
print(f"5 m boat, hotel {HOTEL} W, eta_pv {ETA}, derate {DERATE}; states F={FS} shares {SHARES}; seed 1")
res = {}
for site in ORDER:
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    harv = [harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) * 24.0 for d in days]
    rng = random.Random(1)
    u1 = [rng.random() for _ in days]
    u2 = [rng.random() for _ in days]
    for pack, wh in PACKS.items():
        PACK_WH = wh
        for q in QS:
            st = chain(u1, u2, q)
            b = max(run(harv, st, (v, v, v)) for v in SPEEDS)
            c = max(run(harv, st, t) for t in TRIPLES)
            call = [0] + st[:-1]  # persistence: today's call is yesterday's true state
            e = max(run(harv, st, t, call) for t in TRIPLES)
            hit = sum(x == y for x, y in zip(call, st)) / len(st)
            res[(site, pack, q)] = (b, c, e, hit)
            sh = (e - b) / (c - b) if c > b else float("nan")
            print(f"{site:16s} pack {pack:5s} q={q:4.2f}: B {b:6.1f} C {c:6.1f} (C/B {c/b-1:+.1%}) E {e:6.1f} (E/B {e/b-1:+.1%}) hit rate {hit:.2f} share of C-B gap {sh:+.2f}")
for q in QS:
    v = sorted((e - b) / (c - b) for (si, pk, q_), (b, c, e, h) in res.items() if q_ == q)
    h = [h for (si, pk, q_), (b, c, e, h) in res.items() if q_ == q]
    print(f"q={q:4.2f}: share of C-B gap captured by persistence, median {v[len(v)//2]:+.2f}, min {v[0]:+.2f}, max {v[-1]:+.2f}; hit rate {min(h):.2f}-{max(h):.2f}")
print("cells with E < B overall:", sum(e < b - 1e-9 for (b, c, e, h) in res.values()), "of", len(res))
