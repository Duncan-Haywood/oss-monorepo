"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from beam_twin import *

Q, LEVEL = 0.9, 1e-3
SC = Scene(R0=30.0)
print("Scene: obstacle w=%.1f m, beam spacing %.4f rad, scan rate %g Hz, first visible at R0=%g m, decel %g m/s^2, reaction %g s, confirm with m=%d returns." % (SC.w, SC.delta, SC.f, SC.R0, SC.a, SC.t_react, SC.m))
print("Real sensor: per-beam return q=%.2f, scan fades with probability s (all beams lost together). Twin: independent beams with q_eff=(1-s)q (same mean return rate), no fades. Certification level %g." % (Q, LEVEL))

print("\n== 1. Certified speed and delivered miss probability (m=1) ==")
print("s     q_eff  twin v*   real v*   real/twin | twin-claimed miss  real miss at twin v*  real/level | fade floor s^n  scans n")
for s in (0.0, 0.1, 0.3, 0.5, 0.7):
    qt = (1 - s) * Q
    vt, vr = safe_speed(LEVEL, qt, SC), safe_speed(LEVEL, Q, SC, s)
    mt, mr = miss_probability(vt, qt, SC), miss_probability(vt, Q, SC, s)
    print("%-5.1f %-6.3f %-9.2f %-9.2f %-9.3f | %-18.3g %-21.3g %-10.1f | %-15.3g %d" % (s, qt, vt, vr, vr / vt, mt, mr, mr / LEVEL, fade_floor(vt, s, SC), n_scans(vt, SC)))

print("\n== 2. Miss probability against speed, twin (q_eff=0.63) vs real (q=0.9, s=0.3) ==")
print("v (m/s)  scans  stopping dist (m)  twin miss     real miss     real/twin")
for v in (4, 6, 8, 10, 11, 12, 13):
    a, b = miss_probability(v, 0.63, SC), miss_probability(v, Q, SC, 0.3)
    print("%-8g %-6d %-18.1f %-13.3g %-13.3g %.3g" % (v, n_scans(v, SC), stop_distance(v, SC), a, b, b / a if a > 0 else float("inf")))

print("\n== 3. How far the obstacle first appears matters (s=0.5, m=1): speed certified by twin vs needed by real ==")
print("R0 (m)  twin v*  real v*  real/twin  real miss at twin v*")
for R0 in (20, 30, 50, 100, 150):
    sc = Scene(R0=float(R0))
    vt, vr = safe_speed(LEVEL, 0.45, sc), safe_speed(LEVEL, Q, sc, 0.5)
    print("%-7d %-8.2f %-8.2f %-10.3f %.3g" % (R0, vt, vr, vr / vt, miss_probability(vt, Q, sc, 0.5)))

print("\n== 4. Confirmation count m (R0=30 m, s=0.5, q=0.9; twin q_eff=0.45) ==")
print("m  twin v*  real v*  real miss at twin v*")
for m in (1, 2, 3):
    sc = Scene(R0=30.0, m=m)
    vt, vr = safe_speed(LEVEL, 0.45, sc), safe_speed(LEVEL, Q, sc, 0.5)
    print("%d  %-8.2f %-8.2f %.3g" % (m, vt, vr, miss_probability(vt, Q, sc, 0.5)))

print("\n== 5. Sign reversal: the same matched twin is pessimistic when many beams are needed (w=0.3, m=3, R0=100, q=0.9) ==")
print("s     twin v*  real v*  real miss at twin v*")
sc = Scene(w=0.3, m=3, R0=100.0)
for s in (0.0, 0.3, 0.5, 0.7):
    vt, vr = safe_speed(LEVEL, (1 - s) * Q, sc), safe_speed(LEVEL, Q, sc, s)
    print("%-5.1f %-8.2f %-8.2f %.3g" % (s, vt, vr, miss_probability(vt, Q, sc, s)))

print("\n== 6. Check: exact scan product vs beam-pattern Monte Carlo, 200000 runs ==")
print("v   q    s    m  closed form  simulation")
rng = random.Random(5)
for v, q, s, m in ((11, 0.9, 0.3, 1), (11, 0.6, 0.0, 1), (12, 0.9, 0.3, 2), (12, 0.9, 0.5, 1)):
    sc = Scene(R0=30.0, m=m)
    print("%-3g %-4g %-4g %d  %-12.4g %.4g" % (v, q, s, m, miss_probability(v, q, sc, s), simulate_miss(rng, v, q, sc, 200000, s)))

print("\n== 7. Continuum power law (m=1, s=0, R0=150 m, w=0.5): miss ~ (d/R0)^kappa, rough guide for many beams ==")
sc = Scene(R0=150.0)
print("q    v    exact        power law    exact/power")
for q in (0.3, 0.5, 0.9):
    for v in (20, 26):
        e, p = miss_probability(v, q, sc), powerlaw_miss(v, q, sc)
        print("%-4g %-4d %-12.3g %-12.3g %.3g" % (q, v, e, p, e / p if p > 0 else float("inf")))

print("\n== 8. Repair: estimate the fade rate s from n_cal calibration scans on a known target, rebuild the twin with (q, s_hat). True s=0.3, q=0.9, m=1, R0=30. Exact over the binomial law of s_hat ==")
S_TRUE = 0.3
print("n_cal  mean speed  P(real miss at chosen v > %g)  mean real miss  (oracle v*=%.2f)" % (LEVEL, safe_speed(LEVEL, Q, SC, S_TRUE)))
cache = {}
def v_for(k, n):
    if (k, n) not in cache:
        cache[(k, n)] = safe_speed(LEVEL, Q, SC, k / n)
    return cache[(k, n)]
for n in (20, 50, 200, 1000):
    mean_v = p_bad = mean_miss = 0.0
    for k in range(n + 1):
        w = math.comb(n, k) * S_TRUE ** k * (1 - S_TRUE) ** (n - k)
        if w < 1e-12:
            continue
        v = v_for(k, n)
        mr = miss_probability(v, Q, SC, S_TRUE)
        mean_v += w * v
        p_bad += w * (mr > LEVEL * (1 + 1e-9))
        mean_miss += w * mr
    print("%-6d %-11.2f %-31.3f %.3g" % (n, mean_v, p_bad, mean_miss))
print("twin matched on mean return rate only (s=0 assumed, q_eff=0.63): speed %.2f, real miss %.3g" % (safe_speed(LEVEL, 0.63, SC), miss_probability(safe_speed(LEVEL, 0.63, SC), Q, SC, S_TRUE)))
