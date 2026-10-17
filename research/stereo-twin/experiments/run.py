"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from stereo_twin.model import (Sensor, p_valid, twin_p_beyond_range, over_prob, under_prob, twin_over_prob, twin_under_prob,
                               quantile, gated_mean, gated_var, mean_bias_rel, real_rms_mean, twin_rms_mean, valid_depths,
                               estimators, harmonic_bias_rel_leading, Phi)

S = Sensor()
ZS = (5.0, 10.0, 20.0, 40.0, 60.0)
T = 200000

print("Stereo twin: real = disparity d = k/Z + sigma*eps, depth k/d, matches only if d >= dmin; twin = depth + Gaussian noise with linearised sd Z^2 sigma/k")
print("f = %.0f px, B = %.2f m, k = fB = %.1f px m, sigma = %.2f px, dmin = %.1f px (zmax = %.1f m); sim = %d looks" % (S.f, S.B, S.k, S.sigma, S.dmin, S.zmax(), T))

print("\n== 1. Median, gated mean and lost matches: real vs Gaussian-depth twin ==")
print("   Z(m)  d0(px)  s=sigma/d0  exact median  sim median  gated mean/Z-1  s^2     lost matches  twin beyond zmax")
for Z in ZS:
    zs = sorted(valid_depths(S, Z, T, random.Random(1)))
    sm = zs[len(zs) // 2]
    print("  %5.1f  %5.2f   %.4f      %8.3f      %8.3f     %+.5f      %.5f  %.4f        %.4f" % (
        Z, S.d0(Z), S.s(Z), quantile(S, 0.5, Z), sm, mean_bias_rel(S, Z), S.s(Z) ** 2, 1 - p_valid(S, Z), twin_p_beyond_range(S, Z)))

print("\n== 2. Over- and under-estimates by a fraction a: real (exact, sim) vs twin Phi(-a/s) ==")
print("   Z(m)   a     real over exact  real over sim   twin over   over ratio   real under exact  real under sim  twin under")
for Z in (20.0, 40.0, 60.0):
    rng = random.Random(2)
    draws = [S.d0(Z) + S.sigma * rng.gauss(0, 1) for _ in range(T)]
    for a in (0.1, 0.25, 0.5):
        so = sum(1 for d in draws if d >= S.dmin and S.k / d > Z * (1 + a)) / T
        su = sum(1 for d in draws if d > 0 and S.k / d < Z * (1 - a)) / T
        eo, eu, tw = over_prob(S, a, Z), under_prob(S, a, Z), twin_over_prob(S, a, Z)
        print("  %5.1f  %.2f   %.5f          %.5f        %.5f     %7.1f      %.5f           %.5f         %.5f" % (
            Z, a, eo, so, tw, eo / tw if tw > 0 else float('inf'), eu, su, twin_under_prob(S, a, Z)))

print("\n== 3. Safety margin set at twin mean + k sigma_Z (an obstacle farther than the margin is not seen as one): P(depth > Z + k s Z) ==")
print("   Z(m)  k   twin       real exact   real/twin")
for Z in (10.0, 20.0, 40.0, 60.0):
    for k in (2.0, 3.0):
        a = k * S.s(Z)
        tw, ex = twin_over_prob(S, a, Z), over_prob(S, a, Z)
        print("  %5.1f  %.0f  %.5f    %.5f      %6.1f" % (Z, k, tw, ex, ex / tw))

print("\n== 4. Variance-matched twin: Gaussian with the real (gated) mean and sd; P(depth > Z(1+a)) ==")
print("   Z(m)   a     matched Gaussian   real exact (of valid)   real/matched   real sd/Z   linearised s")
for Z in (20.0, 40.0, 60.0):
    m, v = gated_mean(S, Z), gated_var(S, Z)
    for a in (0.25, 0.5):
        thr = Z * (1 + a)
        tw = 1 - Phi((thr - m) / math.sqrt(v))
        ex = over_prob(S, a, Z) / p_valid(S, Z)
        print("  %5.1f  %.2f    %.5f           %.5f                %6.2f       %.4f      %.4f" % (Z, a, tw, ex, ex / tw if tw > 0 else float('inf'), math.sqrt(v) / Z, S.s(Z)))

print("\n== 5. Averaging N looks of a static point: relative RMS error (about the true depth) of mean depth, k/mean(disparity), median depth ==")
print("twin = s/sqrt(N); exact mean-depth RMS = sqrt(bias^2 + var/N); harmonic leading-order bias = s^2/N; sim = 4000 trials")
for Z in (40.0, 60.0):
    print("  Z = %.0f m, s = %.4f, gated mean bias %+.4f" % (Z, S.s(Z), mean_bias_rel(S, Z)))
    print("      N     twin RMS   exact RMS mean   sim RMS mean  sim RMS harmonic   sim bias harmonic   s^2/N    sim RMS median")
    for N in (1, 4, 16, 64, 256, 1024):
        trials = 4000
        rng = random.Random(5)
        e = [estimators(S, Z, N, rng) for _ in range(trials)]
        e = [x for x in e if x]
        rms = lambda i: math.sqrt(sum((x[i] / Z - 1) ** 2 for x in e) / len(e))
        hb = sum(x[1] / Z - 1 for x in e) / len(e)
        print("  %6d    %.4f     %.4f           %.4f        %.4f             %+.5f           %.5f   %.4f" % (
            N, twin_rms_mean(S, Z, N), real_rms_mean(S, Z, N), rms(0), rms(1), hb, harmonic_bias_rel_leading(S, Z, N), rms(2)))
