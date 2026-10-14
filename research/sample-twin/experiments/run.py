"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from sample_twin.model import (gains, eigenvalues, spectral_radius, is_stable, critical_wnT, design_poles, simulate,
                               simulate_rk4, overshoot, settle_time, twin_overshoot)

print("Sample twin: x'' = u, u = -kp x - kd v sampled every T and held. kp = wn^2, kd = 2 zeta wn, wn = 1 unless stated. Twin: T -> 0.")

print("\n== 1. Stability boundary: real loop stable iff kp T/2 < kd < 2/T, i.e. wn T < min(4 zeta, 1/zeta) ==")
print("zeta   formula wnT_c   bisection on spectral radius   max|x_k| at 0.98 wnT_c   at 1.02 wnT_c (3000 periods, RK4 held-input check)")
for z in (0.25, 0.5, 0.7, 1.0, 2.0, 4.0):
    kp, kd = gains(1.0, z)
    lo, hi = 1e-6, 50.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if spectral_radius(kp, kd, mid) < 1:
            lo = mid
        else:
            hi = mid
    c = critical_wnT(z)
    a = max(abs(s[0]) for s in simulate_rk4(kp, kd, 0.98 * c, 1.0, 3000, sub=20))
    b = max(abs(s[0]) for s in simulate_rk4(kp, kd, 1.02 * c, 1.0, 3000, sub=20))
    print("%-6g %-15.6f %-30.6f %-25.4g %.4g" % (z, c, lo, a, b))
print("(the twin is stable for every wn, zeta > 0; the real loop with zeta = 0.7 fails at wn T = %.4f, i.e. %.2f samples per natural period 2 pi/wn; inf = float overflow)" % (critical_wnT(0.7), 2 * math.pi / critical_wnT(0.7)))

print("\n== 2. zeta = 0.7: real vs twin as wn T grows (time in 1/wn; twin overshoot %.4f, per-sample twin decay exp(-zeta wn T)) ==" % twin_overshoot(0.7))
print("wnT    real |pole|   twin |pole|   real overshoot   real 2% settle   twin 2% settle (T=1e-3)")
kp, kd = gains(1.0, 0.7)
tw = settle_time(kp, kd, 1e-3, 60000)
for Tn in (0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 1.2, 1.3, 1.4, 1.42, 1.45, 1.6):
    ov = overshoot(kp, kd, Tn, 20000)
    st = settle_time(kp, kd, Tn, 20000)
    print("%-6g %-13.5f %-12.5f %-16.4f %-16.3f %.3f" % (Tn, spectral_radius(kp, kd, Tn), math.exp(-0.7 * Tn), ov, st, tw))

print("\n== 3. Faster is not better: T = 0.1 fixed, zeta = 0.7, wn raised (twin promises settle ~ 1/wn) ==")
print("wn     wnT    twin settle   real settle   real |pole|   stable")
for wn in (1, 2, 4, 8, 10, 12, 14, 14.14, 14.3, 16, 20):
    kp, kd = gains(wn, 0.7)
    Ts = 0.1
    twin = settle_time(kp, kd, 1e-4, int(round(20 / wn / 1e-4)))
    real = settle_time(kp, kd, Ts, 20000)
    print("%-6g %-6.3f %-13.4f %-13.3f %-13.5f %s" % (wn, wn * Ts, twin, real, spectral_radius(kp, kd, Ts), is_stable(kp, kd, Ts)))

print("\n== 4. Deadbeat and pole placement on the discrete model (T = 0.2): kp T^2 = 1, kd T = 3/2 ==")
kp, kd = design_poles(0.0, 0.0, 0.2)
print("kp = %.6f kd = %.6f; states after 0..3 samples from x0 = 1:" % (kp, kd), ["(%.3g, %.3g)" % s for s in simulate(kp, kd, 0.2, 1.0, 3)])
print("corresponding wn = sqrt(kp) = %.4f (wn T = %.3f), zeta = kd/(2 wn) = %.4f" % (math.sqrt(kp), math.sqrt(kp) * 0.2, kd / (2 * math.sqrt(kp))))
print("deadbeat settle = %.3f = 2T; continuous overshoot %.4f" % (settle_time(kp, kd, 0.2, 10), overshoot(kp, kd, 0.2, 10)))
print("rho  phi   kp T^2   kd T   |pole| (eig)   settle 2%   overshoot")
for rho, phi in ((0.5, 0.0), (0.5, 0.5), (0.8, 0.3), (0.9, 0.2)):
    kp, kd = design_poles(rho, phi, 0.2)
    print("%-4g %-5g %-8.4f %-6.4f %-14.6f %-11.3f %.4f" % (rho, phi, kp * 0.04, kd * 0.2, spectral_radius(kp, kd, 0.2), settle_time(kp, kd, 0.2, 4000), overshoot(kp, kd, 0.2, 4000)))

print("\n== 5. Twin-designed gains vs the twin's promise, and the sample-rate rule ==")
print("Twin design zeta = 0.7, wn T = 0.5 (twin decay per sample exp(-0.35) = %.4f): real |pole| = %.4f" % (math.exp(-0.35), spectral_radius(*gains(1.0, 0.7), 0.5)))
print("Sample-rate rule T < min(4 zeta, 1/zeta)/wn: samples per 1/wn must exceed, for zeta = 0.3, 0.5, 0.7, 1, 2:",
      ["%.3f" % (1 / critical_wnT(z)) for z in (0.3, 0.5, 0.7, 1, 2)])
