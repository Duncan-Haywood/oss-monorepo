"""Experiments for multi-observation-elicitation. Exact enumeration plus seeded Monte Carlo."""
import random
from fractions import Fraction as F
from math import pi, sqrt
from statistics import NormalDist, pvariance
from multi_observation_elicitation import *

SUP = [F(-2), F(0), F(1), F(5)]
PR = [F(1, 5), F(3, 10), F(1, 4), F(1, 4)]
mu, s2, m4 = moments(SUP, PR)

print("E1. Exact unbiasedness by full enumeration of a 4-point distribution (sigma^2=%s, mu4=%s)" % (s2, m4))
for name, k, m, target in [("pair (variance)", pair_kernel, 2, s2), ("mean^2", sq_mean_kernel, 2, mu ** 2),
                           ("variance^2", sq_var_kernel, 4, s2 ** 2),
                           ("third central moment", third_moment_kernel, 3,
                            sum(p * (y - mu) ** 3 for y, p in zip(SUP, PR)))]:
    print(f"  {name:<22} m={m}  E h = {expected_kernel(k, SUP, PR, m)}  target = {target}  equal: {expected_kernel(k, SUP, PR, m) == target}")
base = expected_score(s2, pair_kernel, SUP, PR, 2)
print("  expected pair score at the truth = Var h =", base, "=", var_pair_kernel(m4, s2), "; excess for report s2+d is exactly d^2:",
      [expected_score(s2 + d, pair_kernel, SUP, PR, 2) - base == d * d for d in (F(-1), F(1, 3), F(2))])
print("  Var of sample variance, exact enumeration vs mu4/m-(m-3)s^4/(m(m-1)):")
for m in (2, 3, 4):
    k = lambda y, m=m: sum((v - sum(y) / m) ** 2 for v in y) / (m - 1)
    ex2 = expected_kernel(lambda y: k(y) ** 2, SUP, PR, m)
    print(f"    m={m}: {ex2 - s2 ** 2}  vs  {var_sample_variance(m4, s2, m)}")

print("\nE2. Relative sd of the sigma estimate from ONE pair, per distribution (payment noise per report)")
rng = random.Random(11)
print(f"{'dist':<10}{'kurtosis':>9}{'variance-score':>16}{'Gini-score':>12}   (MC check of both)")
def mc(draw, n=200000):
    ds = [draw(rng) - draw(rng) for _ in range(n)]
    h = [d * d / 2 for d in ds]; a = [abs(d) for d in ds]
    m_h = sum(h) / n; m_a = sum(a) / n
    return (pvariance(h) ** .5 / m_h) / 2, pvariance(a) ** .5 / m_a
rows = [("Normal", 3.0, sd_rel_sigma_gini(2 / sqrt(pi), 2), lambda r: draw_normal(r)),
        ("Laplace", 6.0, sd_rel_sigma_gini(1.5, 4.0), lambda r: draw_laplace(r)),
        ("t(5)", 9.0, None, lambda r: draw_t(r, 5)), ("t(3)", float("inf"), None, lambda r: draw_t(r, 3))]
for name, kap, gini, dr in rows:
    v, g = mc(dr)
    vs = sd_rel_sigma_variance(kap) if kap != float("inf") else float("inf")
    gs = f"{gini:.3f}" if gini else "  n/a"
    print(f"{name:<10}{kap:9.1f}{vs:16.3f}{gs:>12}   MC: variance {v:.3f}, Gini {g:.3f}")

print("\nE3. Disjoint pairs needed to catch a verifier who under-reports sigma^2 by rho (alpha=.05, power .8), formula vs Monte Carlo power at that N")
rng = random.Random(5)
for kap, name, dr in [(3.0, "Normal", lambda r: draw_normal(r)), (6.0, "Laplace", lambda r: draw_laplace(r))]:
    for rho in (0.5, 0.25, 0.1):
        N = round(detection_pairs(rho, kap))
        z = NormalDist().inv_cdf(0.95)
        hits, T = 0, 2000
        sc = sqrt(1 + rho) if name == "Normal" else sqrt(1 + rho)
        # variance of the unit-scale draws
        v0 = 1.0 if name == "Normal" else 2.0
        for _ in range(T):
            ys = [dr(rng) * sc for _ in range(2 * N)]
            thr = v0 + z * v0 * ((kap + 1) / 2 / N) ** .5
            hits += disjoint_pair_score(ys) > thr
        print(f"  {name:<8} rho={rho:<5} N={N:<6} power {hits / T:.3f}")

print("\nE4. Pooling: same M=20 audited draws, disjoint pairs vs all pairs (=sample variance); variance ratio")
rng = random.Random(9)
for name, kap, dr in [("Normal", 3.0, lambda r: draw_normal(r)), ("Laplace", 6.0, lambda r: draw_laplace(r))]:
    a, b = [], []
    for _ in range(20000):
        ys = [dr(rng) for _ in range(20)]
        a.append(disjoint_pair_score(ys)); b.append(pooled_pair_score(ys))
    print(f"  {name:<8} MC ratio {pvariance(a) / pvariance(b):.3f}   large-M limit (kappa+1)/(kappa-1) = {pooled_vs_disjoint_ratio(kap):.3f}")

print("\nE5. Correlated 'independent' draws (shared seed/batch), coefficient rho: the pair score's minimiser is sigma^2 (1-rho)")
for rho in (0.0, 0.1, 0.3, 0.6):
    print(f"  rho={rho}: sigma^2=1 elicited as {biased_target(1.0, rho):.2f}  -> the verifier can report {100 * rho:.0f}% too small a variance and be exactly right")
