"""Milestone 3p: the c15 three-way rule of Holtrop and Mennen, now coded, and what it changes.

    PYTHONPATH=src python3 experiments/run_holtrop_c15.py > experiments/results_holtrop_c15.txt

Before 3p every hull used c15 = -1.69385 (the L^3/volume < 512 branch). Slender hulls (L/volume^(1/3) > 8:
catamaran demi-hulls, SWATH struts, AUV-like bodies) belong to the other branches. This tabulates c15 and the
wave resistance at Fn 0.30 for a hull at fixed L/B = 12, B/T = 2, Cp = 0.60 (Cm 0.85) swept in slenderness,
old rule against new rule. Illustrative geometry (a sweep), not a measured vessel.
"""
import math
from marine_hull.holtrop import hm_resistance, c15_coefficient

L, CM, CP = 60.0, 0.85, 0.60
print(f"{'L/V^1/3':>8s} {'L3/V':>8s} {'c15 new':>9s} {'RW old kN':>10s} {'RW new kN':>10s} {'ratio':>6s}")
for slend in (6.0, 7.0, 8.0, 8.5, 9.0, 10.0, 11.0, 12.0):
    vol = (L / slend) ** 3
    cb = CP * CM
    bt = vol / (L * cb)           # B*T
    B = math.sqrt(bt * 2.0)       # B/T = 2
    T = B / 2.0
    v = 0.30 * math.sqrt(9.80665 * L)
    new = hm_resistance(v, L, B, T, vol, CM, 0.75)
    import marine_hull.holtrop as h
    keep = h.c15_coefficient
    h.c15_coefficient = lambda l, vv: -1.69385
    old = hm_resistance(v, L, B, T, vol, CM, 0.75)
    h.c15_coefficient = keep
    print(f"{slend:8.1f} {L**3/vol:8.0f} {c15_coefficient(L, vol):9.4f} {old['RW']/1e3:10.2f} {new['RW']/1e3:10.2f} {new['RW']/old['RW']:6.3f}")
