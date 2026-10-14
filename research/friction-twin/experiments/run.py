"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from friction_twin.model import *

m, b, c = 1.0, 1.0, 0.5
print("Friction twin: real m v' = -b v - c (m=1, b=1, c=0.5), twin m v' = -k v with k fitted to coast-down data.")

print("\n== 1. Closed-form stop distance/time vs RK4 (dt=1e-4) ==")
print("v0     dist closed  dist RK4     time closed  time RK4")
worst = 0.0
for v0 in (0.1, 1, 3, 10, 100):
    d, t = simulate_coast(v0, m, b, c)
    dc, tc = real_stop_distance(v0, m, b, c), real_stop_time(v0, m, b, c)
    worst = max(worst, abs(d - dc) / dc, abs(t - tc) / tc)
    print("%-6g %-12.6f %-12.6f %-12.6f %-12.6f" % (v0, dc, d, tc, t))
print("max relative difference = %.1e" % worst)

print("\n== 2. Fitted twin gain k from noiseless deceleration logs, speeds uniform on [v1, v2] ==")
print("range      k closed   k sample LS (n=2000)   affine fit (b, c)")
for v1, v2 in ((1, 3), (0.2, 1), (5, 20), (0.05, 0.3)):
    vs = [v1 + (v2 - v1) * (i + 0.5) / 2000 for i in range(2000)]
    acc = [(b * v + c) / m for v in vs]
    kc = fit_k_closed(v1, v2, m, b, c)
    print("[%g,%g]%s %-10.6f %-22.6f (%.6f, %.6f)" % (v1, v2, " " * (8 - len("%g,%g" % (v1, v2))), kc, fit_k(vs, acc, m), *fit_affine(vs, acc, m)))

print("\n== 3. Stopping distance of the viscous twin fitted on [1,3] (k=%.4f) ==" % fit_k_closed(1, 3, m, b, c))
k = fit_k_closed(1, 3, m, b, c)
print("v0      real dist   twin dist   twin/real")
for v0 in (0.05, 0.2, 1, 3, 10, 100, 1000):
    dr, dt = real_stop_distance(v0, m, b, c), twin_stop_distance(v0, m, k)
    print("%-7g %-11.5f %-11.5f %.4f" % (v0, dr, dt, dt / dr))
print("crossover speed v* = %.4f (twin too long below, too short above); limit v0->inf ratio b/k = %.4f; v0->0 ratio ~ 2c/(k v0)" % (crossover_speed(m, b, c, k), b / k))

print("\n== 4. The twin never stops: time to slow to eps=1e-3 from v0=3 ==")
print("twin %.3f s  vs  real stops at %.3f s (ratio %.2f)" % (twin_time_to_speed(3, 1e-3, m, k), real_stop_time(3, m, b, c), twin_time_to_speed(3, 1e-3, m, k) / real_stop_time(3, m, b, c)))
print("twin time grows as ln(1/eps): eps=1e-3, 1e-6, 1e-9 ->", ", ".join("%.2f" % twin_time_to_speed(3, e, m, k) for e in (1e-3, 1e-6, 1e-9)))

print("\n== 5. Braking margin and the best viscous repair, validity range v0 in [v1, v2] ==")
print("range     LS k     LS worst rel err   LS margin (max real-twin)   minimax k   minimax worst rel err   minimax margin")
for v1, v2 in ((1, 3), (0.2, 1), (0.2, 10), (0.05, 3)):
    kl = fit_k_closed(v1, v2, m, b, c)
    mg = max(0.0, max(real_stop_distance(v, m, b, c) - twin_stop_distance(v, m, kl) for v in [v1 * (v2 / v1) ** (i / 400) for i in range(401)]))
    km, em = minimax_k(m, b, c, v1, v2)
    mm_ = max(0.0, max(real_stop_distance(v, m, b, c) - twin_stop_distance(v, m, km) for v in [v1 * (v2 / v1) ** (i / 400) for i in range(401)]))
    print("[%g,%g]%s %-8.4f %-18.4f %-27.5f %-11.4f %-23.4f %.5f" % (v1, v2, " " * (8 - len("%g,%g" % (v1, v2))), kl, max_rel_error(kl, m, b, c, v1, v2), mg, km, em, mm_))

print("\n== 6. Scaling: ratio twin/real depends on c/(b v0) only (LS k rescaled by the same factor) ==")
for s in (1, 10, 100):
    mm, bb, cc = 1.0, 1.0, 0.5 * s
    v1, v2 = 1 * s, 3 * s
    kk = fit_k_closed(v1, v2, mm, bb, cc)
    print("s=%-4g ratio at v0=2s: %.8f" % (s, twin_stop_distance(2 * s, mm, kk) / real_stop_distance(2 * s, mm, bb, cc)))
