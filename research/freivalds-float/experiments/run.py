import math, random
from freivalds_float import *

print("E1 exact miss probability erf(t/(sqrt2 F))^m of a rank-one corruption, t=1 (F in units of the tolerance)")
print(" F     m=1      m=2      m=4      m=8")
for F in (1, 2, 3, 5, 10, 30):
    print(f" {F:<5}" + "  ".join(f"{miss_rank1(1, F, m):.5f}" for m in (1, 2, 4, 8)))
print(f" one probe misses a corruption of size {fair_probe_size(1):.3f} t exactly half the time")

print("\nE2 probes needed so every corruption with ||E||_F >= F* is missed w.p. <= beta")
print(" F*/t   beta=1e-2  1e-4  1e-6  1e-9")
for F in (1.5, 2, 3, 5, 10, 30):
    print(f" {F:<6} " + "  ".join(f"{probes_needed(1, F, b):>5}" for b in (1e-2, 1e-4, 1e-6, 1e-9)))

print("\nE3 rank-one is the worst case: miss prob for ||E||_F = 3t, singular values equal-split over k (MC 200k)")
rng = random.Random(0)
for k in (1, 2, 4, 8, 16):
    print(f" k={k:<3} miss={miss_mc([3 / math.sqrt(k)] * k, 1, 200000, rng):.4f}")
print(f" exact rank-one: {miss_rank1(1, 3):.4f}")

print("\nE4 Gaussian vs Rademacher probes, corruption E = u v^T, v=(a,a,0..), t=1, one probe")
print(" F        gaussian   rademacher (exact 1/2 once sqrt2 F > t)")
for F in (0.5, 1, 3, 10, 100):
    print(f" {F:<8} {miss_rank1(1, F):.4f}     {miss_rademacher_two(1, F):.4f}")

print("\nE5 honest float32 residual ||A(Br)-Cr|| (A,B entries N(0,1/n), Gaussian r, sequential fp32 accumulation), 30 trials")
ns, means, p99 = (8, 16, 32, 64), [], []
rng = random.Random(1)
allres = {}
for n in ns:
    xs = sorted(honest_residual(n, rng) for _ in range(30 if n < 64 else 12))
    allres[n] = xs
    means.append(sum(xs) / len(xs))
    print(f" n={n:<3} mean={means[-1]:.3e}  max={xs[-1]:.3e}  mean/(eps32*sqrt(n))={means[-1]/(2**-24*math.sqrt(n)):.2f}")
print(f" fitted exponent of residual in n: {fit_exponent(ns, means):.2f}")
n = 32
print(f" false-positive rate at n={n} for t = k x mean residual, and the corruption a cheater may hide:")
for k in (1.5, 2, 3, 4):
    t = k * means[ns.index(n)]
    print(f"  k={k}: FP={false_positive(allres[n], t):.3f}  half-missed size={fair_probe_size(t):.3e}  (= {fair_probe_size(t)/means[ns.index(n)]:.2f} x noise)")

print("\nE6 result-dependent probes (Fiat-Shamir with retries) and cost, t=1")
print(" F     expected tries to find a passing corruption (probe fixed by hash of result)")
for F in (2, 5, 10, 100, 1000):
    print(f" {F:<5} {grind_tries(1, F):>8.1f}")
print(" n      m=8 probes cost / recompute")
for n in (128, 1024, 8192):
    print(f" {n:<6} {verify_cost_ratio(n, 8):.4f}")
