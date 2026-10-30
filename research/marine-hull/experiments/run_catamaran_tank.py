"""Milestone 3b: the programme's displacement resistance model against a published catamaran bare-hull tank curve.

Data: experiments/data/catamaran_bare_hull_tank.csv (Zenodo 18459868, CC BY 4.0).

    PYTHONPATH=src python3 experiments/run_catamaran_tank.py > experiments/results_catamaran_tank.txt
"""
import csv
import math
from marine_hull.hull import cf_ittc57, wave_resistance_fraction, G

RHO, NU = 998.7, 1.0899e-6     # fresh water, 16.8 C (ITTC 7.5-02-01-03, interpolated 15 and 20 C); water type assumed
rows = [r for r in csv.DictReader(l for l in open("experiments/data/catamaran_bare_hull_tank.csv") if not l.startswith("#"))]
V = [float(r["v_m_s"]) for r in rows]
FN = [float(r["fn"]) for r in rows]
RT = [float(r["rt_N"]) for r in rows]
CT = [float(r["ct_exp_x1e3"]) * 1e-3 for r in rows]
L = sum(v / f for v, f in zip(V, FN)) / len(V)
L = (L ** 2) / G
S = [rt / (0.5 * RHO * v * v * ct) for rt, v, ct in zip(RT, V, CT)]
S_MEAN = sum(S) / len(S)
CF = [cf_ittc57(v * L / NU) for v in V]
print(f"L from Fn {L:.3f} m; implied S per speed {', '.join(f'{s:.3f}' for s in S)} m2 "
      f"(spread {(max(S) - min(S)) / S_MEAN * 100:.1f}%)")
print("Fn    CT_exp CF     CR(k=0) CR(k=.25) wave-fraction(placeholder)")
for i in range(len(V)):
    print(f"{FN[i]:.3f} {CT[i]*1e3:6.3f} {CF[i]*1e3:5.3f} {(CT[i]-CF[i])*1e3:7.3f} {(CT[i]-1.25*CF[i])*1e3:9.3f} "
          f"{wave_resistance_fraction(FN[i]):.3f}")


def model(i, k, ws):
    cv = (1 + k) * CF[i]
    return cv * (1 + ws * wave_resistance_fraction(FN[i]))


def err(i, k, ws):
    return model(i, k, ws) / CT[i] - 1


print("\ncentral placeholder (k=0.25, wave_scale=1): error vs tank per speed")
print("  " + ", ".join(f"Fn {FN[i]:.2f}: {err(i, 0.25, 1.0)*100:+.0f}%" for i in range(5)))
for k in (0.0, 0.10, 0.25, 0.40):
    for name, idx in (("all five", range(5)), ("lowest three", range(3))):
        best = min((max(abs(err(i, k, ws / 100)) for i in idx), ws / 100) for ws in range(0, 1001))
        print(f"k={k:.2f} best wave_scale on {name}: {best[1]:.2f}, worst |error| on those {best[0]*100:.0f}%; "
              f"over all five at that scale: {max(abs(err(i, k, best[1])) for i in range(5))*100:.0f}%")
