"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from stop_twin import *

print("Stopping a twin run that counts rare failures: sequential Wald stopping vs inverse sampling (run to m failures).")

print("\n== 0. Exact estimator moments under inverse sampling (sum of the negative-binomial pmf) ==")
print("m    p        E[(m-1)/(N-1)]/p   E[m/N]/p   m/(m-1)   sd of Haldane/p   1/sqrt(m-2)")
for m in (5, 30, 100):
    for p in (0.05, 0.001):
        print("%-4d %-8g %-18.6f %-10.4f %-9.4f %-17.4f %.4f" % (m, p, expected_haldane(m, p) / p, expected_naive(m, p) / p,
              m / (m - 1.0), var_haldane(m, p) ** 0.5 / p, (m - 2.0) ** -0.5))

print("\n== 1. Sequential Wald stopping on an absolute half-width (check every 100 draws from n0=100; 2000 runs) ==")
print("Rule: stop when 1.96 sqrt(p^ (1-p^)/n) <= eps.  A run with zero failures has half-width 0 and stops at once.")
print("p       eps      fixed n for eps   stopped with 0 failures   P(0 fails at n0) exact   coverage of Wald   median n   mean claimed p^")
rng = random.Random(51)
reps = 2000
for p, eps in ((0.01, 0.002), (0.001, 0.0002), (0.0001, 0.00002)):
    ns, zero, cov, ph = [], 0, 0, 0.0
    for _ in range(reps):
        n, k, h = sequential_wald(p, eps, 100, 100, rng)
        ns.append(n)
        zero += k == 0
        cov += abs(k / n - p) <= h
        ph += k / n
    ns.sort()
    print("%-7g %-8g %-17.0f %-25.3f %-24.3f %-18.3f %-10d %.2e" % (p, eps, Z * Z * p * (1 - p) / eps ** 2, zero / reps,
          (1 - p) ** 100, cov / reps, ns[reps // 2], ph / reps))

print("\n== 2. Same rule with a minimum number of failures before stopping is allowed (p=0.001, eps=0.0002, 2000 runs) ==")
print("min failures   coverage   median n   mean n   mean p^/p")
rng = random.Random(52)
for mf in (0, 1, 5, 10, 30):
    ns, cov, ph = [], 0, 0.0
    for _ in range(reps):
        n, k, h = sequential_wald(0.001, 0.0002, 100, 100, rng, min_fail=mf)
        ns.append(n)
        cov += abs(k / n - 0.001) <= h
        ph += k / n
    ns.sort()
    print("%-14d %-10.3f %-10d %-8.0f %.3f" % (mf, cov / reps, ns[reps // 2], sum(ns) / reps, ph / reps / 0.001))

print("\n== 3. Inverse sampling (p=0.001, 2000 runs): exact interval, Haldane vs naive m/N ==")
print("m     E[N] = m/p   mean m/N / p   mean Haldane / p   sd Haldane / p   1/sqrt(m-2)   exact CI coverage   mean CI upper/lower   Wald-at-N coverage")
rng = random.Random(53)
p = 0.001
for m in (10, 30, 100, 400):
    ns = [inverse_sample(p, m, rng) for _ in range(reps)]
    hs = [haldane(m, n) / p for n in ns]
    mh = sum(hs) / reps
    sd = (sum((x - mh) ** 2 for x in hs) / (reps - 1)) ** 0.5
    cov = wcov = 0
    ratio = 0.0
    for n in ns:
        lo, hi = exact_ci(m, n)
        cov += lo <= p <= hi
        ratio += hi / lo
        wcov += abs(m / n - p) <= wald_half(m, n)
    print("%-5d %-12d %-14.4f %-18.4f %-16.4f %-13.4f %-19.3f %-21.3f %.3f" % (m, m / p, sum(m / n for n in ns) / reps / p, mh, sd,
          (m - 2.0) ** -0.5, cov / reps, ratio / reps, wcov / reps))

print("\n== 4. Failures needed for a relative sd r, and what a planned fixed n delivers when p is misjudged ==")
print("r      m = 2 + 1/r^2")
for r in (0.3, 0.2, 0.1, 0.05):
    print("%-6g %d" % (r, m_for_rel_sd(r)))
print("Fixed n planned for a 20%% relative Wald half-width at p0=1e-3 (n = %.0f); true p differs:" % (Z * Z * (1 - 1e-3) / (1e-3 * 0.04)))
n_plan = int(Z * Z * (1 - 1e-3) / (1e-3 * 0.04))
print("true p    expected failures   relative half-width delivered   P(zero failures)   inverse sampling m=102: expected N   relative sd")
for pt in (1e-2, 1e-3, 3e-4, 1e-4, 1e-5):
    print("%-9g %-19.1f %-31.3f %-18.4f %-36.0f %.3f" % (pt, n_plan * pt, fixed_rel_halfwidth(pt, n_plan), (1 - pt) ** n_plan, 102 / pt, (102 - 2.0) ** -0.5))
