"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from doppler_twin import *

S0 = 1.0
print("Radar ego-velocity from n Doppler returns, y_i = v + e_i. Twin: all targets static, e ~ N(0,1) (s0=1).")
print("Real: with prob eps a moving target, e ~ N(0, 1+tau^2). Estimators: mean (LS) and median. Variances are in units of s0^2/n.")

print("\n== 0. Exact laws vs Monte Carlo (n=51, 40,000 repeats) ==")
rng = random.Random(21)
print("eps   tau  mean exact  mean MC (+-se)      median exact  median MC (+-se)")
for eps, tau in ((0.0, 5.0), (0.1, 10.0), (0.3, 3.0)):
    va, vb, sa, sb = mc_var(51, eps, tau, 40000, rng)
    print("%.2f  %-4g %.5f     %.5f +- %.5f   %.5f      %.5f +- %.5f" % (
        eps, tau, var_mean(51, eps, tau), va, sa, var_median_exact(51, eps, tau), vb, sb))

print("\n== 1. Twin's choice. In the twin the median costs pi/2 more variance, so the twin picks the mean. ==")
print("twin: n*Var(mean)=1, n*Var(median)=%.4f (asymptotic pi/2=%.4f)" % (var_median_asym(1, 0, 0), math.pi / 2))
print("Real n*Var, mean vs median (asymptotic), and mean/median ratio (>1 means the twin's choice is worse):")
print("tau   eps    mean      median    mean/median")
for tau in (3.0, 10.0):
    for eps in (0.01, 0.05, 0.1, 0.3, 0.6):
        a, b = var_mean(1, eps, tau), var_median_asym(1, eps, tau)
        print("%-5g %.2f  %-9.3f %-9.3f %.2f" % (tau, eps, a, b, a / b))

print("\n== 2. Band of contamination rates where the median beats the mean (asymptotic) ==")
print("tau   eps_lo    eps_hi")
for tau in (1.0, 2.0, 3.0, 5.0, 10.0, 30.0):
    b = median_wins_band(tau)
    print("%-5g %s" % (tau, "never" if b is None else "%.4f    %.4f" % (crossover_eps(tau), b[1])))

print("\n== 3. Twin-claimed uncertainty. Real variance / claimed = 1+eps tau^2; coverage of the twin's 95% interval (n=30) ==")
print("tau   eps    var ratio   exact coverage")
for tau in (3.0, 10.0):
    for eps in (0.01, 0.05, 0.1, 0.3):
        print("%-5g %.2f   %-9.2f   %.4f" % (tau, eps, cov_claim_ratio(eps, tau), coverage_mean(30, eps, tau)))
rng = random.Random(5)
print("2-D LS (30 returns over a 120-degree sector), trace ratio vs twin claim, 20,000 repeats:")
for eps, tau in ((0.1, 10.0), (0.05, 3.0)):
    print("eps=%.2f tau=%g: MC %.3f, formula %.3f" % (eps, tau, ls2d_cov_ratio_mc(30, eps, tau, 20000, rng), cov_claim_ratio(eps, tau)))

print("\n== 4. Can a residual log tell you? Excess kurtosis 3 eps(1-eps) tau^4/(1+eps tau^2)^2; power of a one-sided sample-kurtosis test ==")
print("(residuals about a known ego-velocity, 5% nominal size using the Gaussian null sd sqrt(24/N); 2,000 repeats per cell)")
print("eps   tau  kurt     " + "  ".join("N=%-5d" % N for N in (20, 50, 200, 1000)))
rng = random.Random(8)
for eps, tau in ((0.1, 10.0), (0.05, 3.0), (0.02, 3.0), (0.0, 0.0)):
    row = []
    for N in (20, 50, 200, 1000):
        rej = 0
        for _ in range(2000):
            x = sample(N, eps, tau, rng)
            mean = sum(x) / N
            m2 = sum((t - mean) ** 2 for t in x) / N
            m4 = sum((t - mean) ** 4 for t in x) / N
            rej += (m4 / m2 ** 2 - 3) > 1.6449 * math.sqrt(24 / N)
        row.append("%.3f  " % (rej / 2000))
    print("%.2f  %-4g %-8.3f %s" % (eps, tau, excess_kurtosis(eps, tau), " ".join(row)))
