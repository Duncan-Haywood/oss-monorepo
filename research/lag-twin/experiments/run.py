"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from lag_twin.model import (gains, tau_star, real_stable, poles, decay_rate, growth_rate_slope, step,
                            twin_overshoot, overshoot)

print("Lag twin: unit mass, first-order actuator tau u' = u_cmd - u, PD control kp = wn^2, kd = 2 zeta wn. Twin: tau = 0.")
print("eps = wn tau; real loop stable iff eps < 2 zeta (tau* = kd/kp).")

print("\n== 1. Twin vs real, zeta = 0.7, wn = 1 (tau* = 1.4): x0 = 1 step, RK4 ==")
print("eps   real decay rate   twin decay rate   real overshoot   twin overshoot   dominant-pole damping")
kp, kd = gains(1.0, 0.7)
for eps in (0.0, 0.1, 0.3, 0.5, 0.8, 1.0, 1.2, 1.3, 1.4, 1.5):
    dr = decay_rate(kp, kd, eps)
    dom = max(poles(kp, kd, eps), key=lambda p: p.real)
    zd = -dom.real / abs(dom)
    T = 60.0 if eps < 1.4 else 200.0
    xs = step(kp, kd, eps, 1.0, T)
    print("%-5g %-17.5f %-17.5f %-16.4f %-16.4f %.4f" % (eps, dr, 0.7, overshoot(xs, 1.0), twin_overshoot(0.7), zd if dom.imag else float('nan')))

print("\n== 2. Routh vs roots, and the boundary frequency ==")
bad = 0
n = 0
for zeta in (0.1, 0.3, 0.5, 0.7, 1.0, 2.0, 5.0):
    for wn in (0.1, 1.0, 10.0, 100.0):
        kp, kd = gains(wn, zeta)
        ts = tau_star(kp, kd)
        for f in (0.5, 0.9, 0.99, 1.01, 1.1, 2.0):
            n += 1
            if real_stable(kp, kd, f * ts) != (decay_rate(kp, kd, f * ts) > 0):
                bad += 1
print("Routh disagrees with root locations in %d of %d (zeta, wn, tau/tau*) cases" % (bad, n))
print("zeta  wn    tau*       boundary |Im pole|   (should equal wn)")
for zeta, wn in ((0.3, 1.0), (0.7, 1.0), (0.7, 10.0), (2.0, 3.0)):
    kp, kd = gains(wn, zeta)
    om = max(abs(p.imag) for p in poles(kp, kd, tau_star(kp, kd)))
    print("%-5g %-5g %-10.5f %.9f" % (zeta, wn, tau_star(kp, kd), om))

print("\n== 3. Growth rate just beyond the limit: d Re(s)/d tau = wn^2 / (2 (1 + 4 zeta^2)) ==")
print("zeta  formula       numeric slope (tau = 1 + 1e-6)     sim rate at tau = 1.05 tau* (fitted from peaks)   root Re(s) there")
for zeta in (0.3, 0.7, 1.0, 2.0):
    kp, kd = gains(1.0, zeta)
    ts = tau_star(kp, kd)
    h = 1e-6 * ts
    num = -decay_rate(kp, kd, ts + h) / h
    tt = 1.05 * ts
    xs = step(kp, kd, tt, 1.0, 400.0)
    dt = min(1e-3, tt / 20)
    peaks = []          # peak |x| of each half-cycle between zero crossings
    cur = 0.0
    for i, x in enumerate(xs):
        if i and xs[i - 1] * x < 0:
            peaks.append(cur)
            cur = 0.0
        cur = max(cur, abs(x))
    a, b = peaks[-6], peaks[-2]
    cross = [i * dt for i in range(1, len(xs)) if xs[i - 1] * xs[i] < 0]
    span = cross[-2] - cross[-6]
    rate = math.log(b / a) / span
    print("%-5g %-13.6f %-34.6f %-49.6f %.6f" % (zeta, growth_rate_slope(1.0, zeta), num, rate, -decay_rate(kp, kd, tt)))

print("\n== 4. Faster is not better in the real loop: tau = 0.05, zeta = 0.7, sweep wn ==")
print("(twin decay rate = zeta wn, increasing forever; real decay rate from the roots)")
print("wn     eps    twin rate   real rate   real stable")
tau = 0.05
best = (0, 0)
for wn in (1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 28.5, 30, 40):
    kp, kd = gains(wn, 0.7)
    r = decay_rate(kp, kd, tau)
    print("%-6g %-6.3f %-11.3f %-11.4f %s" % (wn, wn * tau, 0.7 * wn, r, real_stable(kp, kd, tau)))
print("fine search for the real-optimal wn (max decay rate), by zeta (tau = 1):")
print("zeta  eps*=wn*   real rate at eps*   twin rate zeta eps*   eps limit 2 zeta   eps*/(2 zeta)")
for zeta in (0.3, 0.5, 0.7, 1.0, 1.5, 2.0):
    bestw, bestr = 0, -1
    for k in range(1, 4000):
        eps = k * 0.001 * 2 * zeta
        kp, kd = gains(eps, zeta)   # tau = 1, so wn = eps
        r = decay_rate(kp, kd, 1.0)
        if r > bestr:
            bestr, bestw = r, eps
    print("%-5g %-9.4f %-19.4f %-21.4f %-18g %.3f" % (zeta, bestw, bestr, zeta * bestw, 2 * zeta, bestw / (2 * zeta)))

print("\n== 5. Twin error in the step response (RMS over 0..60 s, zeta = 0.7, wn = 1) ==")
kp, kd = gains(1.0, 0.7)
ref = step(kp, kd, 0.0, 1.0, 60.0, 1e-3)
for eps in (0.01, 0.02, 0.05, 0.1, 0.2, 0.5):
    xs = step(kp, kd, eps, 1.0, 60.0, 1e-3 if eps >= 0.02 else 5e-4)
    if len(xs) != len(ref):
        ref2 = step(kp, kd, 0.0, 1.0, 60.0, 5e-4)
    else:
        ref2 = ref
    rms = math.sqrt(sum((a - b) ** 2 for a, b in zip(xs, ref2)) / len(xs))
    print("eps = %-5g rms %.6f  rms/eps %.4f" % (eps, rms, rms / eps))

print("\n== 6. Design rule: to keep tau_max <= m tau*, need wn <= 2 zeta m / tau_max ==")
print("zeta = 0.7, tau_max = 0.05:  m = tau_max/tau*   wn_max   real decay rate at wn_max")
for m in (1.0, 0.75, 0.5, 0.25, 0.1):   # m = tau_max / tau*
    wn = 2 * 0.7 * m / 0.05
    kp, kd = gains(wn, 0.7)
    print("                             %-7g  %-8.2f %.4f" % (m, wn, decay_rate(kp, kd, 0.05)))

print("\n== 7. Exact speed limit: the pole sum is -1/tau, so no (kp, kd) decays faster than 1/(3 tau) ==")
import random
random.seed(0)
tau = 0.05
best = -1e9
for _ in range(200000):
    kp_ = math.exp(random.uniform(-3, 9))
    kd_ = math.exp(random.uniform(-3, 7))
    r = decay_rate(kp_, kd_, tau)
    best = max(best, r)
print("tau = 0.05: bound 1/(3 tau) = %.5f; best decay rate over 200000 log-uniform (kp, kd) draws = %.5f" % (1 / (3 * tau), best))
wn3 = 1 / (math.sqrt(27) * tau)
z3 = math.sqrt(3) / 2
kp3, kd3 = gains(wn3, z3)
print("triple-pole gains wn = 1/(sqrt(27) tau) = %.4f, zeta = sqrt(3)/2: decay rate %.6f, poles %s" % (
    wn3, decay_rate(kp3, kd3, tau), ", ".join("%.4f%+.1ej" % (p.real, p.imag) for p in poles(kp3, kd3, tau))))
print("twin rate zeta wn at those gains = %.3f; at zeta = 0.7 the twin's promised rate zeta wn exceeds the cap 1/(3 tau) once wn > %.3f" % (
    z3 * wn3, 1 / (3 * tau * 0.7)))
