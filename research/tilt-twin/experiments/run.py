"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from tilt_twin.model import *

print("Rare failure of a twin (S = sum of n N(0,1) disturbances > b): exact mean-shift importance-sampling variance, mis-tuned shifts, coverage.")


def Qinv(p):
    lo, hi = 0.0, 40.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if Q(mid) > p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


N_STEPS = 10
def b_for(p, n=N_STEPS):
    return math.sqrt(n) * Qinv(p)

print("\n== 0. Exact formulas vs simulation (n=10, p=1e-4, 400000 IS runs) ==")
print("theta   mean/p (want 1)   rel.var exact   rel.var simulated")
n = N_STEPS; b = b_for(1e-4); p = p_true(b, n); rng = random.Random(5)
for th in (0.5, 1.0, 1.5, 2.0):
    v = run_is(b, n, th, 400000, rng)
    m = sum(v) / len(v); var = sum((x - m) ** 2 for x in v) / (len(v) - 1)
    print("%-7g %-17.4f %-15.4f %.4f" % (th, m / p, is_relvar(b, n, th), var / p ** 2))

print("\n== 1. Gain from the optimal shift (n=10); runs for 10% relative standard error ==")
print("p        b       theta*   b/n     relvar naive   relvar IS    runs naive   runs IS   speedup")
for pe in (1e-3, 1e-6, 1e-9, 1e-12):
    b = b_for(pe); p = p_true(b, n); t = optimal_theta(b, n)
    rn = (1 - p) / p; ri = is_relvar(b, n, t)
    print("%-8.0e %-7.3f %-8.4f %-7.4f %-14.4g %-12.4g %-12.4g %-9.4g %.4g" % (pe, b, t, b / n, rn, ri, n_for_relerr(0.1, rn), n_for_relerr(0.1, ri), rn / ri))

print("\n== 2. Mis-tuned shift at p=1e-6 (n=10): relvar / relvar(optimal) as the shift moves off theta* ==")
b = b_for(1e-6); t = optimal_theta(b, n); best = is_relvar(b, n, t)
print("theta/theta*   theta    relvar IS     ratio to best")
for f in (0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0):
    r = is_relvar(b, n, f * t)
    print("%-14g %-8.3f %-13.4g %.4g" % (f, f * t, r, r / best))

print("\n== 3. Shift tuned for p0=1e-6 but the true threshold moved (design drift): relvar with fixed theta vs re-tuned ==")
b0 = b_for(1e-6); t0 = optimal_theta(b0, n)
print("b/b0   true p        relvar fixed   relvar re-tuned   ratio")
for f in (0.6, 0.8, 1.0, 1.2, 1.5):
    b = f * b0; p = p_true(b, n); rf = is_relvar(b, n, t0); rt = is_relvar(b, n, optimal_theta(b, n))
    print("%-6g %-12.3e %-14.4g %-17.4g %.4g" % (f, p, rf, rt, rf / rt))

print("\n== 4. Coverage of the 95% normal interval, p=1e-6, n=10, N=1000 runs per estimate, 2000 estimates ==")
b = b_for(1e-6); p = p_true(b, n); t = optimal_theta(b, n); N = 1000; reps = 2000; rng = random.Random(2024)
print("theta/theta*  P(no failure)  coverage   median est/p   median ESS   RMS rel.err   exact rel.err (1 run/sqrt N)")
for f in (0.0, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0):
    th = f * t; cov = 0; zero = 0; ests = []; esss = []
    for _ in range(reps):
        v = run_is(b, n, th, N, rng)
        if not any(v):
            zero += 1; ests.append(0.0); esss.append(0.0); continue
        m, lo, hi = estimate(v); ests.append(m); esss.append(ess(v)); cov += lo <= p <= hi
    ests_sorted = sorted(ests); esss_sorted = sorted(esss)
    rms = math.sqrt(sum((e - p) ** 2 for e in ests) / reps) / p
    print("%-13g %-14.3f %-10.3f %-14.3f %-12.1f %-13.3f %.3f" % (f, zero / reps, cov / reps, ests_sorted[reps // 2] / p, esss_sorted[reps // 2], rms, math.sqrt(is_relvar(b, n, th, N))))
