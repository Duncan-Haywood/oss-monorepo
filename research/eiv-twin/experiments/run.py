"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from eiv_twin.model import *

print("Errors-in-variables twin: y = a u + w, twin fitted on a noisy logged input x = u + v (a=2, su2=1, sw2=0.25).")
A, SU2, SW2 = 2.0, 1.0, 0.25


def rep(n, sv2, rng, second=False):
    return simulate(n, A, SU2, sv2, SW2, rng, second)


print("\n== 0. Population law vs simulation (n=200000) ==")
print("sv2    lam     plim OLS/a   simulated OLS/a   R2 fit   R2 true   corr(resid,x)")
rng = random.Random(7)
for sv2 in (0.0, 0.11, 0.25, 1.0, 4.0):
    x, _, y = rep(200000, sv2, rng)
    b = ols(x, y)
    my = sum(y) / len(y)
    r2_true = 1 - SW2 / (A * A * SU2 + SW2)
    print("%-6g %-7.3f %-12.3f %-17.3f %-8.3f %-9.3f %.1e" % (sv2, reliability(SU2, sv2), plim_ols(A, SU2, sv2) / A, b / A, r2(x, y, b), r2_true, resid_corr(x, y, b)))

print("\n== 1. More data does not help (sv2=0.25, lam=0.8): bias, RMSE and coverage of the twin's own 95% interval for a ==")
print("n       mean b/a   RMSE/a   sd/a exact   sd/a sim   coverage of a   coverage of a*lam")
for n, reps in ((20, 4000), (50, 4000), (200, 4000), (1000, 2000), (5000, 1000)):
    rng = random.Random(100 + n); bs = []; cov_a = 0; cov_l = 0
    for _ in range(reps):
        x, _, y = rep(n, 0.25, rng)
        b = ols(x, y); bs.append(b)
        mx, my = sum(x) / n, sum(y) / n
        res = [(t - my) - b * (s - mx) for s, t in zip(x, y)]
        se = math.sqrt(sum(e * e for e in res) / (n - 2) / sum((s - mx) ** 2 for s in x))
        cov_a += abs(b - A) <= 1.96 * se
        cov_l += abs(b - plim_ols(A, SU2, 0.25)) <= 1.96 * se
    m = sum(bs) / reps; sd = math.sqrt(sum((b - m) ** 2 for b in bs) / (reps - 1))
    rmse = math.sqrt(sum((b - A) ** 2 for b in bs) / reps)
    print("%-7d %-10.4f %-8.4f %-12.4f %-10.4f %-15.3f %.3f" % (n, m / A, rmse / A, math.sqrt(ols_var(A, SU2, 0.25, SW2, n)) / A, sd / A, cov_a / reps, cov_l / reps))

print("\n== 2. Feedforward controller u = r / a_twin: real output / target = a / a_twin -> 1/lam ==")
print("sv2    lam     real/target (exact 1/lam)   n=1000 simulated mean")
for sv2 in (0.05, 0.25, 1.0):
    rng = random.Random(3); rs = []
    for _ in range(1000):
        x, _, y = rep(1000, sv2, rng); rs.append(A / ols(x, y))
    print("%-6g %-7.3f %-27.3f %.3f" % (sv2, reliability(SU2, sv2), 1 / reliability(SU2, sv2), sum(rs) / len(rs)))

print("\n== 3. Repairs, sv2=0.25 (lam=0.8), 4000 repeats: bias/a and RMSE/a ==")
print("n      method                         bias/a    RMSE/a")
for n in (20, 50, 200, 1000):
    rng = random.Random(900 + n); reps = 4000
    res = {k: [] for k in ("OLS", "corrected, sv2 exact", "corrected, sv2 -20%", "corrected, sv2 +20%", "IV (2nd measurement)")}
    for _ in range(reps):
        x, x2, y = rep(n, 0.25, rng, second=True)
        res["OLS"].append(ols(x, y)); res["corrected, sv2 exact"].append(corrected(x, y, 0.25))
        res["corrected, sv2 -20%"].append(corrected(x, y, 0.2)); res["corrected, sv2 +20%"].append(corrected(x, y, 0.3))
        res["IV (2nd measurement)"].append(iv(x, x2, y))
    for k, v in res.items():
        m = sum(v) / reps; rm = math.sqrt(sum((b - A) ** 2 for b in v) / reps)
        print("%-6d %-30s %-9.4f %.4f" % (n, k, (m - A) / A, rm / A))
print("population bias/a of the corrected gain with sv2 misjudged by -20%%/+20%%: %.4f / %.4f" % (
    plim_corrected(A, SU2, 0.25, 0.2) / A - 1, plim_corrected(A, SU2, 0.25, 0.3) / A - 1))

print("\n== 4. Heavier noise, sv2=1 (lam=0.5), 4000 repeats: bias/a and RMSE/a ==")
print("n      method                         bias/a    RMSE/a")
for n in (20, 50, 200, 1000):
    rng = random.Random(1900 + n); reps = 4000
    res = {"OLS": [], "corrected, sv2 exact": [], "IV (2nd measurement)": []}
    for _ in range(reps):
        x, x2, y = rep(n, 1.0, rng, second=True)
        res["OLS"].append(ols(x, y)); res["corrected, sv2 exact"].append(corrected(x, y, 1.0)); res["IV (2nd measurement)"].append(iv(x, x2, y))
    for k, v in res.items():
        m = sum(v) / reps; rm = math.sqrt(sum((b - A) ** 2 for b in v) / reps)
        print("%-6d %-30s %-9.4f %.4f" % (n, k, (m - A) / A, rm / A))
