"""Milestone 3r: does the c15 slender-hull branch (3p) move the programme's 4 to 5 m range verdict?

    PYTHONPATH=src python3 experiments/run_holtrop_c15_range.py > experiments/results_holtrop_c15_range.txt

200 kg craft, 25% battery at 200 Wh/kg, 30 W hotel, eta_prop 0.55 x eta_motor 0.85 (the programme's defaults).
Wigley-proportioned hulls (Cm = Cwp-style 2/3 as in run_holtrop.py), L/B = 10, volume 0.2 m3 (monohull) or
2 x 0.1 m3 (catamaran, demi-hull Holtrop resistance times 2, no interference). Holtrop-Mennen with the c15 rule
of 3p against the pre-3p rule (-1.69385 for every hull). Best range over 0.3 to 3 m/s.
"""
import math
import marine_hull.holtrop as h
from marine_hull.hull import RHO_FRESH

NU, E_WH, P_HOTEL, ETA = 1.1386e-6, 10000.0, 30.0, 0.55 * 0.85
CM = CWP = 2.0 / 3.0
CB = 0.4444


def best(length, n, vol_each, c15_old):
    keep = h.c15_coefficient
    if c15_old:
        h.c15_coefficient = lambda l, v: -1.69385
    try:
        beam = length / 10.0
        draft = vol_each / (CB * length * beam)
        out = (0.0, 0.0)
        for i in range(271):
            v = 0.3 + 0.01 * i
            r = n * h.hm_resistance(v, length, beam, draft, vol_each, CM, CWP, rho=RHO_FRESH, nu=NU)["RT"]
            rng = E_WH * 3600 / ((r * v / ETA + P_HOTEL) / v) / 1000
            if rng > out[0]:
                out = (rng, v)
        return out
    finally:
        h.c15_coefficient = keep


print(f"{'hull':<22s} {'L/V^1/3':>8s} {'L3/V':>7s} {'c15':>7s} {'range old':>10s} {'range new':>10s} {'v new':>6s} {'change':>7s}")
rows = {}
for length in (3.0, 4.0, 5.0):
    for name, n, vol in (("monohull", 1, 0.2), ("catamaran demi-hull", 2, 0.1)):
        old, new = best(length, n, vol, True), best(length, n, vol, False)
        rows[(length, n)] = (old[0], new[0])
        print(f"{name+' '+str(length)+' m':<22s} {length/vol**(1/3):8.2f} {length**3/vol:7.0f} {h.c15_coefficient(length, vol):7.3f} "
              f"{old[0]:10.0f} {new[0]:10.0f} {new[1]:6.2f} {(new[0]/old[0]-1)*100:+6.1f}%")
print("-- catamaran / monohull range ratio at equal length, old and new c15 --")
for length in (3.0, 4.0, 5.0):
    print(f"L {length} m: old {rows[(length,2)][0]/rows[(length,1)][0]:.3f}  new {rows[(length,2)][1]/rows[(length,1)][1]:.3f}")
print("-- where the rule would matter: total-resistance change, new vs old c15, 5 m catamaran demi-hull (0.1 m3) --")
beam = 0.5
draft = 0.1 / (CB * 5.0 * beam)
for fn in (0.15, 0.20, 0.25, 0.30, 0.35, 0.40):
    v = fn * math.sqrt(9.80665 * 5.0)
    new = h.hm_resistance(v, 5.0, beam, draft, 0.1, CM, CWP, rho=RHO_FRESH, nu=NU)["RT"]
    keep = h.c15_coefficient
    h.c15_coefficient = lambda l, vv: -1.69385
    old = h.hm_resistance(v, 5.0, beam, draft, 0.1, CM, CWP, rho=RHO_FRESH, nu=NU)["RT"]
    h.c15_coefficient = keep
    print(f"Fn {fn:.2f} v {v:.2f} m/s: RT old {old:7.2f} N, new {new:7.2f} N ({(new/old-1)*100:+.1f}%)")
