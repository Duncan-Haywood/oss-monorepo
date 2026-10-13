"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from gravity_twin.model import (equilibria, nearest_stable, offset_first_order, simulate, twin_gains, holds,
                                basin_halfwidth)

G = 1.0
print("Gravity twin: pendulum th'' = -g sin th + u (g=1, th=0 hangs down), PD to target th*, kd = 2 zeta sqrt(kp) with zeta = 0.7.")
print("Twin: g = 0 -> zero steady-state error for every kp and th*.")

print("\n== 1. Sag of the PD hold (kp = 4, kd from twin): real equilibrium vs RK4 (T=80) vs first-order formula ==")
print("th*(rad)  twin err   real sag (root)   RK4 sag       first-order   stable")
kp, kd = twin_gains(4.0, 0.7)
for ths in (0.1, 0.5, 1.0, 1.5, 2.0, 2.5):
    e = nearest_stable(kp, G, ths)
    th, w = simulate(kp, kd, G, ths, 0.0, 80.0)
    print("%-9g %-10g %-17.6f %-13.6f %-13.6f %s" % (ths, 0.0, ths - e, ths - th, offset_first_order(kp, G, ths), "yes"))

print("\n== 2. Sag vs kp at th* = 1.0 (the sag falls only as 1/kp) ==")
print("kp     sag (root)   first-order   sag/th*")
for kp_ in (1.0, 2.0, 4.0, 10.0, 40.0, 100.0):
    e = nearest_stable(kp_, G, 1.0)
    print("%-6g %-12.6f %-13.6f %.4f" % (kp_, 1.0 - e, offset_first_order(kp_, G, 1.0), (1.0 - e) / 1.0))

print("\n== 3. Holding upright (th* = pi): stable hold iff kp > g.  Equilibria, and start 0.05 rad from upright at rest, T=400 ==")
print("kp/g   stable equilibria                          holds upright from 0.05 rad?   final th - pi")
for kp_ in (0.5, 0.9, 0.99, 1.01, 1.1, 2.0):
    kd_ = 2.0 * 0.7 * math.sqrt(max(kp_, 1.0))      # fixed reasonable damping, independent of the twin
    eq = [t for t, s in equilibria(kp_, G, math.pi) if s]
    th, w = simulate(kp_, kd_, G, math.pi, math.pi - 0.05, 400.0)
    print("%-6g %-42s %-30s %.5f" % (kp_, ", ".join("%.4f" % t for t in eq) or "none",
                                     "yes" if abs(th - math.pi) < 0.01 else "no", th - math.pi))

print("\n== 4. Basin of the upright hold: first start distance h (rad, at rest, either side) that fails to converge, kd = 2 ==")
print("kp/g   first failing h (rad)   (hmax = 3.0 means none below 3.0)")
for kp_ in (1.02, 1.05, 1.1, 1.2, 1.5, 2.0, 5.0):
    print("%-6g %.4f" % (kp_, basin_halfwidth(kp_, 2.0, G, math.pi, hmax=3.0)))

print("\n== 5. Gravity feedforward gff sin(th*) with a mis-calibrated gff (true g = 1), kp = 4, th* = 1.0 ==")
print("gff/g   residual sag (root)   first-order (g-gff) sin th*/(kp+g cos th*)")
for gff in (0.0, 0.5, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5):
    e = nearest_stable(4.0, G, 1.0, gff)
    print("%-7g %-20.6f %.6f" % (gff, 1.0 - e, offset_first_order(4.0, G, 1.0, gff)))
