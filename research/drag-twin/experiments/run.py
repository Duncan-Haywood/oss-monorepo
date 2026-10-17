"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from drag_twin.model import (real_speed, real_time_to_ratio, twin_time_to_ratio, k_matched, k_lsq_uniform, terminal_real,
                             terminal_twin, stop_dist_real, stop_dist_twin, safe_speed_real, safe_speed_twin, rk4_real,
                             fit_k_from_coastdown)

C = 0.05          # real quadratic drag coefficient (1/m), unit mass
print("Drag twin: real v' = -c v|v| + u with c = %.2f; twin v' = -k v + u. Unit mass, SI-like units." % C)

print("\n== 1. Closed forms vs RK4 (dt = 1e-3) ==")
v, x = rk4_real(10.0, C, 0.0, 20.0, 1e-3)
print("coast-down v0=10, T=20: RK4 v %.6f closed %.6f; distance RK4 %.5f closed %.5f" % (v, real_speed(20.0, 10.0, C), x, math.log(1 + C * 10 * 20) / C))

print("\n== 2. Coast-down: time to fall to v0/10; twin matched at v_fit = 5 (k = c v_fit = %.3f) ==" % k_matched(C, 5.0))
k = k_matched(C, 5.0)
print("v0     real t    twin t    twin/real  (ratio = ln10/9 * v0/v_fit = 0.2558 v0/v_fit)")
for v0 in (1.0, 2.5, 5.0, 10.0, 20.0):
    tr, tt = real_time_to_ratio(10, v0, C), twin_time_to_ratio(10, k)
    print("%-6g %-9.3f %-9.3f %-9.3f" % (v0, tr, tt, tt / tr))
print("Distance covered while falling to v0/10, v0 = 10: real %.2f m, twin %.2f m" % (math.log(10) / C, 0.9 * 10 / k))

print("\n== 3. Terminal speed under constant thrust F = 5 (real sqrt(F/c) = %.3f) ==" % terminal_real(5.0, C))
vt = terminal_real(5.0, C)
print("v_fit   twin terminal   twin/real (= v_term/v_fit)")
for vf in (1.0, 2.0, 5.0, vt, 15.0, 20.0):
    print("%-7.3f %-15.3f %.3f" % (vf, terminal_twin(5.0, k_matched(C, vf)), terminal_twin(5.0, k_matched(C, vf)) / vt))

print("\n== 4. Least-squares linear fit of the drag force over speeds uniform in [0, vmax]: k = 3 c vmax / 4 ==")
print("Drag-force ratio twin/real = 0.75 vmax / v; it is 1 at v = 0.75 vmax; at vmax it is 0.75 (25% under), at 0.25 vmax it is 3.0")
vmax = 20.0
kk = k_lsq_uniform(C, vmax)
for f in (0.1, 0.25, 0.5, 0.75, 1.0, 1.5):
    print("v = %.2f vmax: twin/real drag = %.3f" % (f, kk / (C * f * vmax)))

print("\n== 5. Safe speed under a stopping-distance limit D = 10 m, brake B = 4 (real safe v0 = %.3f) ==" % safe_speed_real(10.0, 4.0, C))
vr = safe_speed_real(10.0, 4.0, C)
print("v_fit  k      twin safe v0   twin vs real   real stop dist at twin's 'safe' speed")
for vf in (1.0, 2.0, 5.0, 10.0, 20.0):
    k = k_matched(C, vf)
    vs = safe_speed_twin(10.0, 4.0, k)
    print("%-6g %-6.3f %-14.3f %+-13.1f%% %.2f m" % (vf, k, vs, 100 * (vs / vr - 1), stop_dist_real(vs, 4.0, C)))
print("twin with k -> 0 (frictionless, constant braking only): safe v0 %.3f (v0^2 = 2 B D)" % math.sqrt(2 * 4.0 * 10.0))
print("twin safe speed at v_fit = 10.0 vs real: stopping distance at real safe speed under twin k: %.2f m (limit 10)" % stop_dist_twin(vr, 4.0, k_matched(C, 10.0)))

print("\n== 6. Stopping distance error across speeds, twin matched at v_fit = 5 ==")
k = k_matched(C, 5.0)
print("v0     real     twin     (twin-real)/real")
for v0 in (2.0, 5.0, 10.0, 15.0, 20.0, 30.0):
    a, b = stop_dist_real(v0, 4.0, C), stop_dist_twin(v0, 4.0, k)
    print("%-6g %-8.3f %-8.3f %+.1f%%" % (v0, a, b, 100 * (b - a) / a))

print("\n== 7. k fitted by least squares to one coast-down trace (speed samples, dt=0.05), then used elsewhere ==")
print("trace: v0 = 10, length T; fitted k vs k_matched at v0 (=%.3f) and at v0/2 (=%.3f)" % (C * 10, C * 5))
for T in (2.0, 5.0, 10.0, 20.0, 40.0):
    kf = fit_k_from_coastdown(C, 10.0, T, 0.05)
    print("T=%-5g fitted k %.4f   (mean real speed over the trace %.2f)" % (T, kf, sum(real_speed(i * 0.05, 10.0, C) for i in range(int(T / 0.05) + 1)) / (int(T / 0.05) + 1)))
print("noisy traces (sigma = 0.2, T = 10, 200 seeds): fitted k mean / sd")
ks = [fit_k_from_coastdown(C, 10.0, 10.0, 0.05, 0.2, random.Random(s)) for s in range(200)]
m = sum(ks) / len(ks)
print("mean %.4f sd %.4f; noiseless %.4f" % (m, (sum((x - m) ** 2 for x in ks) / (len(ks) - 1)) ** 0.5, fit_k_from_coastdown(C, 10.0, 10.0, 0.05)))
