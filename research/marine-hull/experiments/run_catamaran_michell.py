"""Milestone 3q: Michell + Havelock catamaran wave term against the 3b tank curve (Zenodo 18459868).

Geometry is not in the data files; demi-hulls are Wigley hulls with L = 2.812 m (from Fn), whose total wetted
area is fixed to the area implied by the tank CT (1.709 m2). L/B (draft solved from the area) and spacing s/L are swept.

    PYTHONPATH=src python3 experiments/run_catamaran_michell.py > experiments/results_catamaran_michell.txt
"""
import csv, math, statistics as st
from marine_hull.hull import cf_ittc57, G
from marine_hull.michell import wave_resistance_wigley, wigley_wetted

RHO, NU = 998.7, 1.0899e-6
rows = list(csv.DictReader(l for l in open("experiments/data/catamaran_bare_hull_tank.csv") if not l.startswith("#")))
V = [float(r["v_m_s"]) for r in rows]; FN = [float(r["fn"]) for r in rows]
RT = [float(r["rt_N"]) for r in rows]; CT = [float(r["ct_exp_x1e3"]) * 1e-3 for r in rows]
L = (sum(v / f for v, f in zip(V, FN)) / len(V)) ** 2 / G
S = sum(rt / (0.5 * RHO * v * v * ct) for rt, v, ct in zip(RT, V, CT)) / len(V)
CF = [cf_ittc57(v * L / NU) for v in V]

def draft_for(lb):
    B = L / lb
    lo, hi = 0.01, 0.6
    for _ in range(40):
        T = (lo + hi) / 2
        if 2 * wigley_wetted(L, B, T) < S: lo = T
        else: hi = T
    return B, (lo + hi) / 2

print(f"L {L:.3f} m, total wetted area from tank {S:.3f} m2; rho {RHO}, nu {NU}")
res = {}
for lb in (8, 10, 12):
    if True:
        B, T0 = draft_for(lb)
        for sl in (0.15, 0.25, 0.40):
            cw = [wave_resistance_wigley(V[i], L, B, T0, rho=RHO, n_hulls=2, sep=sl * L) / (0.5 * RHO * V[i] ** 2 * S) for i in range(5)]
            for k in (0.0, 0.1):
                res[(lb, 0, sl, k)] = [((1 + k) * CF[i] + cw[i]) / CT[i] - 1 for i in range(5)]
        print(f"L/B {lb}: B {B:.3f} m, draft solved {T0:.3f} m (B/T {B/T0:.2f})")
print("\nFn         " + " ".join(f"{f:7.3f}" for f in FN))
for k in (0.0, 0.1):
    cases = [v for key, v in res.items() if key[3] == k]
    for name, fn in (("median", st.median), ("min", min), ("max", max)):
        print(f"k={k} {name:6s}" + " ".join(f"{fn(c[i] for c in cases)*100:+6.0f}%" for i in range(5)))
    within = [sum(abs(c[i]) <= 0.2 for c in cases) for i in range(5)]
    print(f"k={k} cases within 20% per Fn: {within} of {len(cases)}")
    print(f"k={k} cases within 20% at the 3 lowest Fn: {sum(all(abs(c[i])<=0.2 for i in range(3)) for c in cases)}")
