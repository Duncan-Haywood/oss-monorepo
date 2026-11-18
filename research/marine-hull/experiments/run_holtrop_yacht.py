"""Milestone 3g: Holtrop-Mennen residuary resistance against the Delft yacht hull series (308 tank points).

    PYTHONPATH=src python3 experiments/run_holtrop_yacht.py > experiments/results_holtrop_yacht.txt

Data: UCI "Yacht Hydrodynamics" (Gerritsma, Onnink and Versluis 1981 DSYHS; CC BY 4.0), columns LCB (% L, + forward),
Cp, L/V^(1/3), B/T, L/B, Fn, 1000*Rr/(m g). Rr is total minus ITTC-1957 friction on the wetted area, so it holds form
drag and waves: HM's counterpart is RF*k1 + RW. Not given: midship and waterplane coefficients, model length. Swept.
"""
import math, itertools, statistics as st
from marine_hull.hull import G
from marine_hull.holtrop import hm_resistance

rows = [list(map(float, l.split())) for l in open("experiments/data/yacht_hydrodynamics.data") if l.strip()]
print(f"{len(rows)} tank points; {len({tuple(r[:5]) for r in rows})} hulls; Fn {min(r[5] for r in rows)} to {max(r[5] for r in rows)}")
RHO, NU = 999.1, 1.1386e-6
def pred(r, L, cm, cwp):
    lcb, cp, lv, bt, lb, fn, rr = r
    vol = (L / lv) ** 3; B = L / lb; T = B / bt
    v = fn * math.sqrt(G * L)
    o = hm_resistance(v, L, B, T, vol, cm, cwp, lcb_pct=lcb, rho=RHO, nu=NU)
    # cb = vol/(L B T) is fixed by the data, so cm must satisfy cp = cb/cm <= 1
    return (o["RF"] * (o["1+k1"] - 1) + o["RW"]) / (RHO * G * vol) * 1e3
res = {}
for L, cm, cwp in itertools.product((1.0, 2.0), (0.70, 0.80, 0.90), (0.65, 0.75, 0.85)):
    for r in rows:
        cb = (L / r[2]) ** 3 / (L * (L / r[4]) * (L / r[4] / r[3]))
        if cb / cm > 1: continue
        res.setdefault((L, cm, cwp), []).append((r[5], r[6], pred(r, L, cm, cwp)))
def q(x, p): x = sorted(x); return x[int(p * (len(x) - 1))]
print("L cm cwp n | band Fn: median(pred/meas) and share within +-20% (meas > 0.05 only)")
for k, v in res.items():
    out = []
    for lo, hi in ((0.125, 0.2), (0.2, 0.3), (0.3, 0.45)):
        x = [p / m for f, m, p in v if lo <= f <= hi and m > 0.05]
        out.append(f"[{lo}-{hi}] n{len(x)} med {st.median(x):.2f} in20% {sum(0.8 <= t <= 1.2 for t in x) / len(x):.0%}")
    print(k, len(v), " | ".join(out))
v = res[(1.0, 0.80, 0.75)]
print("-- central (L 1 m, Cm 0.80, Cwp 0.75): measured vs HM by Fn --")
for f in sorted({a for a, _, _ in v}):
    x = [(m, p) for a, m, p in v if a == f]
    print(f"Fn {f:.3f} n{len(x)} meas median {st.median(m for m,_ in x):.2f} HM median {st.median(p for _,p in x):.2f}")
