"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from gate_twin.model import (INF, z_of_alpha, mixture, gain, accept_prob, mse_update, inlier_reject, outlier_accept,
                             worst_kappa, best_z, sample_mse, steady_prior, lockout_formula, simulate_recovery)

P, R = 1.0, 1.0
K = gain(P, R)
EPS, KAPPA = 0.05, 10.0
S2 = math.sqrt(P + R)
real = mixture(EPS, KAPPA, R)
twin = mixture(0.0, 1.0, R)

print("Gate twin: prior error variance P=%g, twin sensor N(0,R=%g), gain K=P/(P+R)=%g" % (P, R, K))
print("real sensor: N(0,R) w.p. %g, N(0,(%g)^2 R) w.p. %g (outliers); gate |nu| <= z sqrt(P+R), z = Phi^-1(1-alpha/2)" % (1 - EPS, KAPPA, EPS))

print("\n== 1. Post-update MSE: twin vs real, ungated vs gated (alpha = tail prob. of the twin innovation) ==")
print("  alpha   z      twin_ungated twin_gated  real_ungated real_gated  real_ungated/real_gated  twin cost of gate  real inlier rej.  outlier accept.")
for alpha in (0.05, 0.01, 0.001):
    z = z_of_alpha(alpha)
    c = z * S2
    tu, tg = mse_update(P, twin, K, INF), mse_update(P, twin, K, c)
    ru, rg = mse_update(P, real, K, INF), mse_update(P, real, K, c)
    print("  %-6g  %.3f  %.4f       %.4f      %.4f       %.4f      %.3f                    %+.2f%%             %.4f            %.4f" % (
        alpha, z, tu, tg, ru, rg, ru / rg, 100 * (tg / tu - 1), inlier_reject(P, R, c), outlier_accept(P, KAPPA ** 2 * R, c)))
print("  (twin sees the gate as a pure loss of data; no ungated MSE of the real sensor is below %.4f)" % mse_update(P, real, K, INF))

print("\n== 2. Worst outlier scale at eps=%g, alpha=0.01: MSE vs kappa (ungated grows like kappa^2, gated peaks) ==" % EPS)
c01 = z_of_alpha(0.01) * S2
print("  kappa   ungated      gated        outlier accept.")
for k in (1, 2, 3, 5, 10, 30, 100, 1000, 10000):
    cm = mixture(EPS, k, R)
    print("  %-6g  %-11.4g  %-11.4f  %.4f" % (k, mse_update(P, cm, K, INF), mse_update(P, cm, K, c01), outlier_accept(P, k * k * R, c01)))
for alpha in (0.05, 0.01, 0.001):
    c = z_of_alpha(alpha) * S2
    kk, v = worst_kappa(P, EPS, R, K, c)
    print("  alpha=%-6g worst kappa %.2f, gated MSE there %.4f (twin gated %.4f, real clean-only ungated %.4f)" % (
        alpha, kk, v, mse_update(P, twin, K, c), mse_update(P, twin, K, INF)))

print("\n== 3. Which gate does the real sensor want? best z (grid) vs the twin's choice ==")
print("  eps    kappa  best z   best MSE   MSE at z(0.01)  MSE ungated  twin-optimal z")
for eps, kappa in ((0.01, 10), (0.05, 10), (0.2, 10), (0.05, 3), (0.05, 100)):
    cm = mixture(eps, kappa, R)
    z, v = best_z(P, cm, K, R)
    print("  %-5g  %-5g  %.3f    %.4f     %.4f          %.4f       inf (no gate)" % (
        eps, kappa, z, v, mse_update(P, cm, K, c01), mse_update(P, cm, K, INF)))

print("\n== 4. Monte Carlo check of the exact MSE (1,000,000 draws, seed 11) ==")
rng = random.Random(11)
for label, cm, c in (("real gated alpha=.01", real, c01), ("real gated alpha=.05", real, z_of_alpha(0.05) * S2), ("twin gated alpha=.01", twin, c01)):
    ex = mse_update(P, cm, K, c)
    mc = sample_mse(P, cm, K, c, 1000000, rng)
    print("  %-22s exact %.4f  MC %.4f  ratio %.4f" % (label, ex, mc, mc / ex))

print("\n== 5. Lockout after a jump D in a random walk (Q=0.01, R=1, z=2.576): rejected updates and time to |error|<=1 ==")
Q = 0.01
Pss = steady_prior(Q, R)
Kss = Pss / (Pss + R)
z = z_of_alpha(0.01)
print("  steady prior variance %.4f, gain %.4f" % (Pss, Kss))
print("  D     noise-free count  MC mean rejected  MC mean t_recover gated  t_gated/D^2  MC mean t_recover ungated")
rng = random.Random(5)
N = 400
for D in (3, 5, 8, 12, 20):
    f = lockout_formula(D, z, Q, R, Pss)
    g = [simulate_recovery(D, z, Q, R, Kss, rng, True) for _ in range(N)]
    u = [simulate_recovery(D, z, Q, R, Kss, rng, False) for _ in range(N)]
    tg = sum(t for _, t in g) / N
    print("  %-4g  %-16d  %-16.1f  %-24.1f  %-11.1f  %.1f" % (D, f, sum(a for a, _ in g) / N, tg, tg / D ** 2, sum(t for _, t in u) / N))
