"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from warmup_twin import *

print("A twin run started away from steady state: exact AR(1) bias/MSE, M/M/1 empty start, MSER-5, false certification.")

print("\n== 0. AR(1): exact bias and variance of the run mean from start offset delta=3 (marginal sd 1) vs simulation (20000 runs) ==")
print("phi   n    d   bias exact   bias simulated   Var exact   Var simulated")
rng = random.Random(11)
for phi, n, d in ((0.5, 50, 0), (0.9, 100, 0), (0.9, 100, 20), (0.99, 400, 0), (0.99, 400, 200)):
    reps = 20000
    ms = [sum(ar1_from(phi, n, rng, 3.0)[d:]) / (n - d) for _ in range(reps)]
    mean = sum(ms) / reps
    v = sum((m - mean) ** 2 for m in ms) / reps
    print("%-5g %-4d %-3d %-12.4f %-16.4f %-11.5f %.5f" % (phi, n, d, ar1_bias(n, phi, 3.0, d), mean, ar1_var(n, phi, d), v))

print("\n== 1. AR(1) delta=3: MSE-optimal warm-up d* and the MSE it saves (exact) ==")
print("phi   n      bias(d=0)   sd(d=0)   MSE(d=0)   d*     MSE(d*)   MSE ratio   relaxation time 1/(1-phi)")
for phi in (0.5, 0.9, 0.99):
    for n in (100, 1000, 10000):
        d, mse = best_warmup(n, phi, 3.0, dmax=min(n // 2, 2000))
        b0, v0 = ar1_bias(n, phi, 3.0), ar1_var(n, phi)
        print("%-5g %-6d %-11.4f %-9.4f %-10.5f %-6d %-9.5f %-11.3f %.0f" % (phi, n, b0, math.sqrt(v0), b0 * b0 + v0, d, mse, (b0 * b0 + v0) / mse, 1 / (1 - phi)))

print("\n== 2. M/M/1 empty start: bias of the mean wait over the first n jobs (2000 runs; true mean rho/(1-rho)) ==")
print("rho   true   n       mean of run means   bias   (s.e.)   bias/true")
rng = random.Random(21)
for rho in (0.5, 0.7, 0.9):
    for n in (500, 2000, 10000):
        reps = 2000
        ms = [sum(mm1_waits(rho, n, rng)) / n for _ in range(reps)]
        mean = sum(ms) / reps
        se = math.sqrt(sum((m - mean) ** 2 for m in ms) / (reps - 1) / reps)
        t = mm1_wait_mean(rho)
        print("%-5g %-6.2f %-7d %-19.3f %-6.3f %-8.3f %.3f" % (rho, t, n, mean, mean - t, se, (mean - t) / t))

print("\n== 3. rho=0.9, n=5000 jobs from an empty queue, 2000 runs: what to discard? ==")
print("rule            mean discarded   bias   RMSE   batch(30) cover   batch half-width")
rng = random.Random(31)
n, reps, t = 5000, 2000, mm1_wait_mean(0.9)
runs = [mm1_waits(0.9, n, rng) for _ in range(reps)]
rules = {"none": lambda xs: 0, "fixed 10%": lambda xs: n // 10, "fixed 30%": lambda xs: 3 * n // 10, "MSER-5": mser}
for name, f in rules.items():
    ms, cov, hw, dd = [], 0, 0.0, 0
    for xs in runs:
        d = f(xs)
        dd += d
        m, h = batch_ci(xs[d:], 30)
        ms.append(m)
        cov += abs(m - t) <= h
        hw += h
    bias = sum(ms) / reps - t
    rmse = math.sqrt(sum((m - t) ** 2 for m in ms) / reps)
    print("%-15s %-16.0f %-6.3f %-6.3f %-17.3f %.3f" % (name, dd / reps, bias, rmse, cov / reps, hw / reps))

print("\n== 4. False certification: true mean wait 9 (rho=0.9), SLA 8 (violated); certify if mean + half-width < 8 ==")
print("n       rule        certified (violating system passes)")
rng = random.Random(41)
for n in (3000, 10000):
    reps = 2000
    runs = [mm1_waits(0.9, n, rng) for _ in range(reps)]
    for name, f in (("none", lambda xs: 0), ("fixed 30%", lambda xs: 3 * len(xs) // 10), ("MSER-5", mser)):
        c = 0
        for xs in runs:
            m, h = batch_ci(xs[f(xs):], 30)
            c += m + h < 8.0
        print("%-7d %-11s %.3f" % (n, name, c / reps))
