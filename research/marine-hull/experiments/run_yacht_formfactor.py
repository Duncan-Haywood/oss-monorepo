"""Milestone 3i: form factor implied by the Delft yacht series at Fn 0.125, against Holtrop-Mennen's k1 and the programme's k = 0.25.

    PYTHONPATH=src python3 experiments/run_yacht_formfactor.py > experiments/results_yacht_formfactor.txt

Rr (tank) = total minus ITTC-1957 friction, so at the lowest Froude number (wave making smallest) Rr/RF is an upper
bound on the form factor k (waves are non-negative). RF uses HM's wetted-area regression (true area unknown), so the
number moves with Cm; Cm 0.7 to 0.9 and L 1 m swept as in 3g. Stdlib only, instant.
"""
import math, statistics as st
from marine_hull.hull import G
from marine_hull.holtrop import hm_resistance
rows = [list(map(float, l.split())) for l in open("experiments/data/yacht_hydrodynamics.data") if l.strip()]
RHO, NU, L = 999.1, 1.1386e-6, 1.0
hulls = {}
for r in rows: hulls.setdefault(tuple(r[:5]), {})[r[5]] = r[6]
print(f"{len(hulls)} hulls; implied k = Rr(Fn 0.125)/RF, upper bound on form factor; HM k1 = its own form factor minus 1")
for cm in (0.7, 0.8, 0.9):
    ks, k1s, ks2 = [], [], []
    for (lcb, cp, lv, bt, lb), d in hulls.items():
        vol = (L / lv) ** 3; B = L / lb; T = B / bt
        if vol / (L * B * T) / cm > 1: continue
        o = hm_resistance(0.125 * math.sqrt(G * L), L, B, T, vol, cm, 0.75, lcb_pct=lcb, rho=RHO, nu=NU)
        rr = d[0.125] * 1e-3 * RHO * G * vol
        ks.append(rr / o["RF"]); k1s.append(o["1+k1"] - 1)
        ks2.append((d[0.15] * 1e-3 * RHO * G * vol) / o["RF"])
    q = lambda x, p: sorted(x)[int(p * (len(x) - 1))]
    print(f"Cm {cm}: n{len(ks)} implied k at Fn .125 median {st.median(ks):.3f} (10-90%: {q(ks,.1):.3f} to {q(ks,.9):.3f}, max {max(ks):.3f}); "
          f"at Fn .150 median {st.median(ks2):.3f}; HM k1 median {st.median(k1s):.3f} (10-90%: {q(k1s,.1):.3f} to {q(k1s,.9):.3f}); share implied k < 0.25: {sum(k<0.25 for k in ks)/len(ks):.0%}; share implied < HM k1 (paired): {sum(k<h for k,h in zip(ks,k1s))/len(ks):.0%}")
