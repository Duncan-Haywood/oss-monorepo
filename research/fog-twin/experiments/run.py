"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from fog_twin.model import (lambertw, range_uniform, elasticity, alpha_from_range, range_bank, alpha_of_visibility, range_quantile,
                            lognormal_quantile_alpha, stopping_distance, safe_speed, p_unsafe)

R0, DECEL, TR = 100.0, 5.0, 0.5   # clear-air range of the reference target (m), braking (m/s^2), reaction time (s)

print("Fog twin: lidar r exp(alpha r) = r0, r0=%g m, braking %g m/s^2, reaction %g s" % (R0, DECEL, TR))

print("\n== 1. Detection range in uniform fog (exact, Lambert W) ==")
print("  V(m)   alpha(1/m)  alpha*r0   range(m)   clear-air twin overstates by exp(alpha r)   elasticity W/(1+W)")
for v in (5000, 2000, 1000, 500, 200, 100, 50, 30):
    a = alpha_of_visibility(v)
    r = range_uniform(a, R0)
    print("%6d  %9.5f  %8.3f  %8.2f   x%-6.3f (check r0/r = %.3f)                 %.3f" % (v, a, a * R0, r, math.exp(a * r), R0 / r, elasticity(a, R0)))

print("\n== 2. Mis-set extinction: relative range error vs relative extinction error (true V = 200 m) ==")
a_true = alpha_of_visibility(200.0)
r_true = range_uniform(a_true, R0)
print("true range %.2f m, elasticity %.3f" % (r_true, elasticity(a_true, R0)))
print("  alpha_twin/alpha_true   twin range(m)   range error   |range err| / |alpha err|")
for k in (0.25, 0.5, 0.8, 0.9, 1.1, 1.25, 2.0, 4.0):
    r = range_uniform(k * a_true, R0)
    print("  %5.2f                  %8.2f       %+7.1f%%      %.3f" % (k, r, 100 * (r / r_true - 1), abs(r / r_true - 1) / abs(k - 1)))

print("\n== 3. Fog density varies between episodes: alpha ~ LogNormal(median alpha(V=500 m), sigma) ==")
med = alpha_of_visibility(500.0)
rng = random.Random(0)
N = 400000
print("median alpha %.5f /m (V=500 m), clear-air range %g m; %d Monte Carlo draws, seed 0" % (med, R0, N))
print("  sigma  range(median alpha)  E[range] (MC)  range(E[alpha])  range q05  range q50  range q95   (m)")
for sg in (0.25, 0.5, 0.8, 1.2):
    draws = [med * math.exp(sg * rng.gauss(0, 1)) for _ in range(N)]
    mc = sum(range_uniform(a, R0) for a in draws) / N
    ea = med * math.exp(sg * sg / 2)
    print("  %.2f   %10.2f         %8.2f       %10.2f       %7.2f    %7.2f    %7.2f" % (
        sg, range_uniform(med, R0), mc, range_uniform(ea, R0), *(range_quantile(med, sg, R0, q) for q in (0.05, 0.5, 0.95))))

print("\n   A driving policy picks its speed so that stopping distance <= the detection range its twin believes.")
print("   Violation probability P(real range < stopping distance), closed form; MC check in brackets (200000 draws)")
sg = 0.8
print("   sigma = %.1f" % sg)
print("   twin                      believed range(m)  speed(m/s)  stopping dist(m)  P(violation)  [MC]")
for name, rb in (("clear air", R0), ("median-alpha", range_uniform(med, R0)), ("E[alpha]", range_uniform(med * math.exp(sg * sg / 2), R0)),
                 ("q05 range (calibrated)", range_quantile(med, sg, R0, 0.05)), ("q01 range", range_quantile(med, sg, R0, 0.01))):
    v = safe_speed(rb, DECEL, TR)
    p = p_unsafe(v, R0, med, sg, DECEL, TR)
    r2 = random.Random(7)
    n = 200000
    d = stopping_distance(v, DECEL, TR)
    mc = sum(range_uniform(med * math.exp(sg * r2.gauss(0, 1)), R0) < d for _ in range(n)) / n
    print("   %-24s  %8.2f           %6.2f      %8.2f          %.4f       [%.4f]" % (name, rb, v, stopping_distance(v, DECEL, TR), p, mc))
vq = safe_speed(range_quantile(med, sg, R0, 0.05), DECEL, TR)
print("   speed cost of the q05 policy relative to the clear-air one: %.1f%% slower" % (100 * (1 - vq / safe_speed(R0, DECEL, TR))))
print("   fraction of fog draws in which the clear-air policy cannot see its stopping distance: %.3f" % p_unsafe(safe_speed(R0, DECEL, TR), R0, med, sg, DECEL, TR))

print("\n== 4. Patchy fog: calibrate one extinction on one target, predict another ==")
B, AB = 40.0, 0.05
print("fog bank: clear before %g m, alpha_b = %g /m beyond. Target reflectivity enters only via clear-air range r0." % (B, AB))
print("  r0(m)  true range(m)   uniform-twin range if calibrated on r0=150 (alpha_eff)   if calibrated on r0=45")
ab = alpha_from_range(range_bank(AB, B, 150.0), 150.0)
ad = alpha_from_range(range_bank(AB, B, 45.0), 45.0)
print("  alpha_eff(r0=150) = %.5f /m, alpha_eff(r0=45) = %.5f /m (r0=45 sits just beyond the bank start, so it barely feels the fog)" % (ab, ad))
for r0 in (20.0, 30.0, 45.0, 60.0, 80.0, 100.0, 150.0, 250.0):
    t = range_bank(AB, B, r0)
    p1 = range_uniform(ab, r0)
    p2 = range_uniform(ad, r0)
    print("  %5.0f  %9.2f      %9.2f (%+6.1f%%)                                       %9.2f (%+6.1f%%)" % (
        r0, t, p1, 100 * (p1 / t - 1), p2, 100 * (p2 / t - 1)))
