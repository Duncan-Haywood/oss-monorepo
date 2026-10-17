"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from particle_twin.model import (mixture, c0, a_coef, rho, mean_ess_fraction, prob_ess_below, abs_quantile, particles_needed,
                                 particles_for_mean, sample_ess, sample_y, estimator_msd, pf_step)

P, R = 1.0, 1.0
EPS, KAPPA = 0.05, 10.0
twin = mixture(0.0, 1.0, R)
real = mixture(EPS, KAPPA, R)
rng = random.Random(7)

print("Particle twin: prior x~N(0,P=%g), twin sensor N(0,R=%g), bootstrap weights exp(-(y-x)^2/(2R))" % (P, R))
print("real sensor: N(0,R) w.p. %g, N(0,(%g)^2 R) w.p. %g (outliers). rho(y)=c0 exp(-a y^2), c0=%.4f, a=%.4f" % (1 - EPS, KAPPA, EPS, c0(P, R), a_coef(P, R)))

print("\n== 1. Mean ESS fraction (large N, exact) vs d, twin vs real ==")
print("  d   twin      real      real/twin")
for d in (1, 2, 4, 8, 16):
    t, r = mean_ess_fraction(P, R, twin, d), mean_ess_fraction(P, R, real, d)
    print("  %-3d %.5f   %.5f   %.4f" % (d, t, r, r / t))
N_MC, TR = 2000, 1500
mt, _ = sample_ess(rng, N_MC, P, R, twin, TR)
mr, _ = sample_ess(rng, N_MC, P, R, real, TR)
print("  Monte Carlo d=1, N=%d, %d draws of y: twin %.4f, real %.4f (exact large-N %.4f, %.4f)" % (
    N_MC, TR, mt, mr, mean_ess_fraction(P, R, twin), mean_ess_fraction(P, R, real)))

print("\n== 2. Tail: P(ESS fraction < theta), d=1, exact large-N ==")
print("  theta    twin        real        real/twin")
for th in (0.3, 0.1, 0.03, 0.01, 0.003, 0.001):
    t, r = prob_ess_below(th, P, R, twin), prob_ess_below(th, P, R, real)
    print("  %-7g  %-10.3e  %-10.3e  %.1f" % (th, t, r, r / t))

print("\n  P(ESS fraction < 0.01) vs outlier scale kappa (eps=%g)" % EPS)
print("  kappa  P(ESS<1%)")
for k in (1, 2, 3, 5, 10, 30, 100):
    print("  %-6g %.4e" % (k, prob_ess_below(0.01, P, R, mixture(EPS, k, R))))

print("\n== 3. Sizing N for ESS >= 50 w.p. 1-delta (large-N approximation, d=1) ==")
print("  delta   |y| quantile twin/real   N twin     N real")
for dl in (0.2, 0.1, 0.05, 0.02, 0.01, 0.001):
    print("  %-6g  %.3f / %.3f           %-9.0f  %.4g" % (dl, abs_quantile(dl, P, twin), abs_quantile(dl, P, real),
                                                     particles_needed(50, dl, P, R, twin), particles_needed(50, dl, P, R, real)))
for dl, n in ((0.1, 142), (0.01, 527)):
    N = int(particles_needed(50, dl, P, R, twin) + 1)
    for name, comps in (("twin", twin), ("real", real)):
        _, ess = sample_ess(rng, N, P, R, comps, 3000)
        fail = sum(1 for e in ess if e < 50) / len(ess)
        print("  N=%d (twin-sized for delta=%g): %s fails ESS<50 in %.4f of 3000 steps" % (N, dl, name, fail))

print("\n== 4. When does N*rho(y) predict ESS? (N=2000, 200 runs per y) ==")
print("  y      N*rho(y)    MC ESS")
for y in (0, 2, 4, 6, 8, 10, 12):
    tot = 0.0
    for _ in range(200):
        tot += pf_step(rng, 2000, P, R, y)[0]
    print("  %-5g  %-10.3f  %.3f" % (y, 2000 * rho(y, P, R), tot / 200))

print("\n== 5. Estimator error: mean sq. deviation of PF posterior mean from the exact Kalman update (3000 steps) ==")
print("  N      twin       real       real/twin")
for N in (50, 200, 1000):  # real y has outliers beyond the prior's reach: a few particles carry all the weight
    t, r = estimator_msd(rng, N, P, R, twin, 3000), estimator_msd(rng, N, P, R, real, 3000)
    print("  %-6d %.5f   %.5f   %.2f" % (N, t, r, r / t))
