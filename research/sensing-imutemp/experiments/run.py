"""Writes experiments/results.txt. Under a minute."""
import math
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_imutemp import (Grade, white_walk_var, fused_var, better_grade, units_needed,
                             floor_rms, max_ramp_for_tie, simulate)

HERE = os.path.dirname(__file__)
# Illustrative consumer-grade gyro, NOT a datasheet. ARW and rate walk as in sensing-imuarray;
# shared tempco 0.002 deg/s/degC, unit-to-unit spread 0.004 deg/s/degC (both assumptions).
CHEAP = Grade(0.005, 0.005 * math.sqrt(3) / 100.0, 0.002, 0.004)
T = 100.0
out = []


def p(s=""):
    print(s)
    out.append(s)


def fmt(n):
    return "never" if n is None else str(n)


p("# sensing-imutemp: n cheap gyros vs one better gyro under a temperature ramp (single axis, stylised)")
p(f"cheap grade: N = {CHEAP.N}, K = {CHEAP.K:.3e}, shared tempco mu = {CHEAP.mu}, spread s = {CHEAP.s} (deg/s per degC)")
p(f"horizon T = {T:.0f} s; better grade: every term (incl. tempco) k times lower; price ratio c => n = c")

p("\n## A. Smallest n that ties the better unit vs ramp rate r (degC/min), uncompensated")
p("r_degC_per_min  k=3_n  k=3_floor_rms_deg  k=10_n  k=10_floor_rms_deg  single_cheap_rms_deg")
for rm in [0, 0.01, 0.03, 0.1, 0.3, 0.6, 1.0, 2.0]:
    r = rm / 60.0
    row = [f"{rm:<15}"]
    for k in (3, 10):
        b = better_grade(CHEAP, k)
        row.append(f"{fmt(units_needed(CHEAP, b, T, r)):>6}  {floor_rms(CHEAP, T, r):.5f}")
    row.append(f"{math.sqrt(fused_var(CHEAP, 1, T, r)):.5f}")
    p("  ".join(row))

p("\n## B. Largest ramp (degC/min) at which n fused cheap units still tie, uncompensated, T = 100 s")
p("k  n  max_ramp_degC_per_min")
for k in (3, 10):
    b = better_grade(CHEAP, k)
    for mult in (1, 2, 5, 10):
        n = mult * k * k
        r = max_ramp_for_tie(CHEAP, b, n, T)
        p(f"{k}  {n}  {r * 60:.3f}")

p("\n## C. Compensation: cheap units compensated to residual fraction f, better unit not, k = 3, ramp 1 degC/min")
b = better_grade(CHEAP, 3)
r = 1.0 / 60
p("f  n_needed  floor_rms_deg")
for f in (1.0, 0.5, 0.3, 0.2, 0.1, 0.05):
    p(f"{f}  {fmt(units_needed(CHEAP, b, T, r, f_cheap=f))}  {floor_rms(CHEAP, T, r, f):.5f}")
p("\n## D. Same, but both grades compensated to the same f (k = 3, ramp 1 degC/min)")
p("f  n_needed")
for f in (1.0, 0.5, 0.1, 0.02):
    p(f"{f}  {fmt(units_needed(CHEAP, b, T, r, f_cheap=f, f_better=f))}")

p("\n## E. Monte Carlo against the closed form (T = 100 s, ramp 0.12 degC/min, 8,000 trials)")
p("n  mc_rms_deg  formula_rms_deg")
rng = np.random.default_rng(0)
for n in (1, 4, 16):
    a = simulate(CHEAP, n, T, 1.0, 0.002, 8000, rng)
    p(f"{n}  {math.sqrt(np.mean(a ** 2)):.5f}  {math.sqrt(fused_var(CHEAP, n, T, 0.002)):.5f}")

with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
