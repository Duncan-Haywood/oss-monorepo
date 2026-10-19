"""Writes experiments/results.txt and imuarray.png. ~1 minute."""
import math
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_imuarray import (Grade, angle_var, fused_angle_var, better_grade, units_needed,
                              breakeven_rho, crossover_time, simulate_units, allan_var, fit_allan)

HERE = os.path.dirname(__file__)
# Illustrative consumer-grade gyro, NOT a datasheet: ARW 0.005 deg/sqrt(s) (0.3 deg/sqrt(h)),
# rate random walk chosen so white noise and bias walk cross at 100 s.
CHEAP = Grade(0.005, 0.005 * math.sqrt(3) / 100.0)
out = []


def p(s=""):
    print(s)
    out.append(s)


p("# sensing-imuarray: n cheap gyros vs one better gyro at equal cost (single axis, stylised)")
p(f"cheap grade: N = {CHEAP.N} deg/sqrt(s), K = {CHEAP.K:.3e} deg/s/sqrt(s); "
  f"white = bias-walk variance at T = {crossover_time(CHEAP):.0f} s")
p("better grade: both densities k times lower; price ratio c => the equal-cost array has n = c cheap units")

# A. Allan fit of the simulated cheap unit
rng = np.random.default_rng(0)
dt, steps = 1.0, 400000
bias = np.cumsum(CHEAP.K * math.sqrt(dt) * rng.standard_normal(steps))
rate = bias + CHEAP.N / math.sqrt(dt) * rng.standard_normal(steps)
ms = np.array([1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024])
av = np.array([allan_var(rate, dt, int(m)) for m in ms])
N_hat, K_hat = fit_allan(ms * dt, av)
p("\n## A. Allan-variance fit of one simulated cheap unit (400,000 s at 1 Hz, one run)")
p(f"fitted N = {N_hat:.5f} (true {CHEAP.N}), K = {K_hat:.3e} (true {CHEAP.K:.3e})")

# B. units needed (= price ratio at which the array ties) vs common rho
p("\n## B. Smallest n (= price ratio c) at which n fused cheap units tie the better unit, equal rho on white and bias terms")
rhos = [0, 0.001, 0.003, 0.01, 0.03, 0.1]
for k in (3, 10):
    b = better_grade(CHEAP, k)
    p(f"\nk = {k} (better unit {k}x lower noise; independent-error tie needs n = k^2 = {k*k}; rho floor 1/k^2 = {1/k**2:.4f})")
    p("T (s) | " + " | ".join(f"rho={r}" for r in rhos))
    for T in (10, 100, 1000, 3600):
        row = []
        for r in rhos:
            n = units_needed(CHEAP, b, T, r, r)
            row.append("none" if n is None else str(n))
        p(f"{T:>5} | " + " | ".join(row))

# C. shared temperature drift only on the bias walk
p("\n## C. Only the bias walk is shared (rho_b = 0.3, e.g. common temperature drift), white noise independent (rho_w = 0)")
for k in (3, 10):
    b = better_grade(CHEAP, k)
    row = []
    for T in (1, 10, 100, 300, 1000, 3600):
        n = units_needed(CHEAP, b, T, 0.0, 0.3)
        row.append(f"T={T}: " + ("none" if n is None else str(n)))
    p(f"k = {k}: " + "; ".join(row))

# D. break-even rho vs price ratio
p("\n## D. Largest common rho at which c = n cheap units still tie (T = 100 s)")
for k in (3, 10):
    b = better_grade(CHEAP, k)
    cs = [c for c in (2, 4, 9, 16, 32, 100, 300, 1000) if c > 1]
    p(f"k = {k}: " + "; ".join(f"c={c}: " + ("<0 (loses even at rho=0)" if breakeven_rho(CHEAP, b, c, 100) < 0 else f"{breakeven_rho(CHEAP, b, c, 100):.4f}") for c in cs))

# E. Monte Carlo check
p("\n## E. Monte Carlo check of the closed form (k = 4, T = 200 s, dt = 1 s, 4,000 trials, rho_w = rho_b = rho)")
p("n | rho | MC fused/better RMS | formula | MC single/better RMS | formula")
rng = np.random.default_rng(1)
b4 = better_grade(CHEAP, 4)
T = 200.0
for n in (4, 16, 32):
    for r in (0.0, 0.02, 0.1):
        a = simulate_units(CHEAP, n, T, 1.0, r, r, 4000, rng)
        mc_f = a.mean(axis=1).std() / math.sqrt(angle_var(b4, T))
        fo_f = math.sqrt(fused_angle_var(CHEAP, n, T, r, r) / angle_var(b4, T))
        mc_s = a[:, 0].std() / math.sqrt(angle_var(b4, T))
        fo_s = math.sqrt(angle_var(CHEAP, T) / angle_var(b4, T))
        p(f"{n} | {r} | {mc_f:.3f} | {fo_f:.3f} | {mc_s:.3f} | {fo_s:.3f}")

# F. unequal improvement: the better unit has 10x lower ARW but only 3x lower rate random walk
p("\n## F. Unequal improvement: better unit has kN = 10x lower ARW but kK = 3x lower rate random walk (independent errors)")
bu = Grade(CHEAP.N / 10, CHEAP.K / 3)
p("T (s) | n to tie, rho=0 | n to tie, rho=0.01 | n to tie, rho=0.05")
for T in (1, 10, 30, 100, 300, 1000, 3600):
    row = []
    for r in (0, 0.01, 0.05):
        n = units_needed(CHEAP, bu, T, r, r)
        row.append("none" if n is None else str(n))
    p(f"{T:>5} | " + " | ".join(row))

with open(os.path.join(HERE, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.4, 3.8))
b = better_grade(CHEAP, 4)
ns = np.arange(1, 129)
for r in (0, 0.01, 0.03, 0.06, 0.1):
    ax.plot(ns, [math.sqrt(fused_angle_var(CHEAP, n, 100, r, r) / angle_var(b, 100)) for n in ns], label=f"rho = {r}")
ax.axhline(1, color="k", lw=0.8)
ax.set_xscale("log"); ax.set_yscale("log")
ax.set_xlabel("n cheap gyros (= price ratio c at equal cost)")
ax.set_ylabel("fused RMS angle error / better unit's (T = 100 s)")
ax.set_title("k = 4: below 1 the cheap array wins; floor at 4*sqrt(rho)")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "imuarray.png"), dpi=120)
