"""Delay margin: analytic against what a fixed-step simulator gives. python3 experiments/run.py > experiments/results.txt"""
import math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from delaymargin import analytic_margin, max_stable_steps

WN = 2.0                      # natural frequency of the PD loop, kp = WN^2 (rad/s)
ZETAS = [0.3, 0.5, 0.7, 1.0, 2.0]
DTS = [0.1, 0.05, 0.02, 0.01, 0.005]
SCHEMES = ["euler", "semi", "zoh"]

print("Delay margin of x'' = -kp x(t-tau) - kd v(t-tau), kp = %g, kd = 2 zeta wn" % WN ** 2)
print("== 1. analytic margin")
print("zeta tau_star_s crossover_w_rad_s")
for z in ZETAS:
    t, w = analytic_margin(WN ** 2, 2 * z * WN)
    print("%.2f %.4f %.4f" % (z, t, w))
print("== 2. simulator margin n*dt (s) and relative error vs analytic, zeta = 0.7")
print("dt " + " ".join("%s_err_pct" % s for s in SCHEMES) + " steps_zoh")
z = 0.7
t = analytic_margin(WN ** 2, 2 * z * WN)[0]
for dt in DTS:
    row = []
    for s in SCHEMES:
        n = max_stable_steps(s, dt, WN ** 2, 2 * z * WN)
        row.append("nan" if n < 0 else "%.2f" % (100 * (n * dt - t) / t))
    print("%g %s %d" % (dt, " ".join(row), max_stable_steps("zoh", dt, WN ** 2, 2 * z * WN)))
print("== 3. relative error (pct) of the zoh simulator margin at dt = 0.02, by zeta")
print("zeta euler semi zoh")
for z in ZETAS:
    t = analytic_margin(WN ** 2, 2 * z * WN)[0]
    row = []
    for s in SCHEMES:
        n = max_stable_steps(s, 0.02, WN ** 2, 2 * z * WN)
        row.append("nan" if n < 0 else "%.2f" % (100 * (n * 0.02 - t) / t))
    print("%.2f %s" % (z, " ".join(row)))
print("== 4. the delay a controller at dt = 0.1 can hide: margin in steps")
print("zeta analytic_steps_at_dt0.1 euler semi zoh")
for z in ZETAS:
    t = analytic_margin(WN ** 2, 2 * z * WN)[0]
    print("%.2f %.2f %s" % (z, t / 0.1, " ".join(str(max_stable_steps(s, 0.1, WN ** 2, 2 * z * WN)) for s in SCHEMES)))
print("== 5. rule check: zoh margin n equals the largest n with (n + 1/2) dt < tau_star")
print("zeta dt n_simulated n_rule match")
bad = 0
tot = 0
for z in ZETAS:
    t = analytic_margin(WN ** 2, 2 * z * WN)[0]
    for dt in DTS:
        n = max_stable_steps("zoh", dt, WN ** 2, 2 * z * WN)
        rule = math.ceil(t / dt - 0.5) - 1
        tot += 1
        bad += n != rule
        print("%.2f %g %d %d %s" % (z, dt, n, rule, "yes" if n == rule else "NO"))
print("mismatches %d of %d" % (bad, tot))
