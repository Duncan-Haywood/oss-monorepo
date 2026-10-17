"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from glint_twin.model import (glint, centroid, mean_y, var_y, tail_prob, outside_span_prob, gaussian_twin_tail, mean_bias,
                              median_var_per_look, sample, median, mean_est, rms_error, real_rms_mean_to_centroid,
                              twin_rms_mean, mean_beats_median_var, y_max, y_min, quantile)

RS = (0.1, 0.3, 0.5, 0.7, 0.9, 0.97)
T = 200000

print("Glint twin: ideal linear monopulse on two unresolved scatterers; strong at +d/2 (amplitude 1), weak at -d/2 (amplitude r), phase ~ U[0,2pi)")
print("estimate = (d/2) Y, Y = (1-r^2)/(1+r^2+2r cos phi); all values in units of d/2 (Y=1 strong scatterer, Y=-1 weak one); sim = %d phase draws" % T)

print("\n== 1. Moments: real glint vs the power-centroid twin (exact vs simulation) ==")
print("   r    centroid   sim median   exact mean  sim mean    exact var   sim var      mean-centroid  range of Y")
rng = random.Random(1)
for r in RS:
    ys = sample(r, T, rng)
    m = sum(ys) / T
    v = sum((y - m) ** 2 for y in ys) / T
    print("  %.2f   %.4f     %.4f       %.4f      %.4f      %8.3f    %8.3f      %.4f         [%.3f, %.2f]" % (
        r, centroid(r), median(ys), mean_y(r), m, var_y(r), v, mean_bias(r), y_min(r), y_max(r)))

print("\n== 2. Estimate beyond the strong scatterer (outside the target span): P(Y>1) = arccos(r)/pi ==")
print("twin = Normal(centroid, var matched to the real glint)")
print("   r    exact       sim         twin Gaussian   twin/real")
for r in RS:
    ys = sample(r, T, random.Random(2))
    sim = sum(y > 1 for y in ys) / T
    tw = gaussian_twin_tail(1.0, r)
    print("  %.2f   %.4f      %.4f      %.4f          %.2f" % (r, outside_span_prob(r), sim, tw, tw / outside_span_prob(r)))

print("\n== 3. Tracker gate: fraction of looks outside the twin's centroid + k sigma (upper side), real vs Gaussian twin ==")
print("   r     k   gate (units d/2)  real exact   real sim    twin Gaussian   real/twin")
for r in (0.5, 0.9, 0.97):
    ys = sample(r, T, random.Random(3))
    for k in (1.0, 2.0, 3.0):
        g = centroid(r) + k * math.sqrt(var_y(r))
        ex = tail_prob(g, r)
        sim = sum(y > g for y in ys) / T
        tw = gaussian_twin_tail(g, r)
        ratio = "%.1f" % (ex / tw) if ex > 0 else "-"
        print("  %.2f  %.0f    %8.3f         %.5f      %.5f     %.5f        %s%s" % (
            r, k, g, ex, sim, tw, ratio, "  (gate beyond y_max=%.1f: real never exceeds it)" % y_max(r) if g >= y_max(r) else ""))

print("\n== 4. Averaging N looks (frequency agility): where does it converge? RMS error vs the power centroid and vs the strong scatterer ==")
print("(mean of N looks; median of N looks; 'twin' = Gaussian twin prediction sqrt(var/N) around the centroid)")
TR = 4000
for r in (0.5, 0.9):
    print("  r = %.2f: mean bias to centroid %.3f, per-look var mean %.3f, per-look asymptotic var median %.3f" % (
        r, mean_bias(r), var_y(r), median_var_per_look(r)))
    print("     N     mean->centroid (sim / exact / twin)    median->centroid (sim)    mean->strong (sim)   median->strong (sim)")
    for n in (1, 4, 16, 64, 256, 1024):
        tr = TR if n <= 256 else TR // 4
        a = rms_error(r, n, mean_est, centroid(r), tr, 7)
        b = rms_error(r, n, median, centroid(r), tr, 8)
        c = rms_error(r, n, mean_est, 1.0, tr, 7)
        d = rms_error(r, n, median, 1.0, tr, 8)
        print("   %5d     %.3f / %.3f / %.3f                   %.3f                    %.3f                %.3f" % (
            n, a, real_rms_mean_to_centroid(r, n), twin_rms_mean(r, n), b, c, d))

print("\n== 5. Efficiency of mean vs median (per-look asymptotic variance) ==")
print("Gaussian twin: mean is pi/2 = 1.571 times more efficient than median at every r. Real:")
print("   r     var(mean)   var(median)   median/mean   mean wins on variance?")
for r in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9):
    print("  %.2f   %8.4f    %8.4f       %6.3f       %s" % (r, var_y(r), median_var_per_look(r), median_var_per_look(r) / var_y(r), mean_beats_median_var(r)))
lo, hi = 0.01, 0.99
for _ in range(80):
    mid = (lo + hi) / 2
    if mean_beats_median_var(mid):
        lo = mid
    else:
        hi = mid
print("crossover (var equal) at r = %.4f; above it the median has lower variance than the mean, as well as no bias to the centroid" % lo)

print("\n== 6. Looks needed before the mean's bias to the centroid dominates its noise (N* = var/bias^2) ==")
print("   r     bias    var     N* = var/bias^2")
for r in (0.3, 0.5, 0.7, 0.9):
    print("  %.2f   %.3f   %6.3f   %.2f" % (r, mean_bias(r), var_y(r), var_y(r) / mean_bias(r) ** 2))
