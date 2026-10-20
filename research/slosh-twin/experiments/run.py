"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from slosh_twin.model import (Tank, bang_bang_accel, min_time, residual_formula, residual, slosh_trajectory, simulate_two_mass,
                              null_times, window_halfwidth, planned_time, planned_residual, smallest_safe_order, first_unsafe_order_fixed_accel, envelope_time, order_estimate,
                              fastest_safe_time)

D, AMAX, TOL = 3.0, 0.5, 0.01                 # move 3 m, |a| <= 0.5 m/s^2, slosh tolerance 1 cm
T0 = Tank()                                   # M = 80 kg, liquid 20 kg, full tank, slosh frequency w = pi rad/s (period 2 s)
print("Slosh twin: real = cart + damped slosh mass; twin = rigid mass M+m.  M=%g kg, m_full=%g kg, w_full=%.4f rad/s (P=%.3f s)" % (
    T0.M, T0.m_full, T0.w, 2 * math.pi / T0.w))
print("move D=%g m, a_max=%g m/s^2, tolerance %g m; twin minimum-time T_min = %.3f s = %.3f slosh periods" % (
    D, AMAX, TOL, min_time(D, AMAX), min_time(D, AMAX) / (2 * math.pi / T0.w)))

print("\n== 1. Residual slosh after a bang-bang move, undamped, full tank (twin predicts 0 for every T) ==")
print("T (s)   a0 (m/s^2)   closed form   exact propagation   RK4 two-mass |z|,|z'/w|   COM error (m)")
for T in (3.0, 4.0, 4.9, 6.0, 7.0, 8.0):
    a0 = bang_bang_accel(D, T)
    cf = residual_formula(T0.mu, a0, T0.w, T)
    ex = residual(T0, D, T)
    x1, xc, z, zd = simulate_two_mass(T0, D, T)
    print("%5.2f   %9.4f   %11.5f   %17.5f   %22.5f   %12.2e" % (T, a0, cf, ex, math.hypot(z, zd / T0.w), abs(xc - D)))

print("\n== 2. The twin-planned minimum-time move, T = T_min: what the twin does not see ==")
Tm = min_time(D, AMAX)
for zeta in (0.0, 0.02, 0.05):
    t = Tank(zeta=zeta)
    peak, res, zT = slosh_trajectory(t, D, Tm)
    x1, xc, z, zd = simulate_two_mass(t, D, Tm)
    print("zeta=%.2f  peak |z| during move %.4f m, residual amplitude %.4f m (%.1fx tol), cart position error at T %.2e m (RK4), bound m/(M+m)*residual = %.4f m" % (
        zeta, peak, res, res / TOL, abs(x1 - D), t.m / (t.M + t.m) * res))

print("\n== 3. Fastest real move with residual <= %g m (scan upward from T_min in 2 ms steps), full tank ==" % TOL)
a_at = lambda T: bang_bang_accel(D, T)
print("undamped nulls T_n = 2 n P:", ", ".join("%.3f" % x for x in null_times(T0.w, 4)))
for n in (1, 2, 3):
    Tn = null_times(T0.w, n)[-1]
    print("  window around n=%d: +-%.3f s at a0 = %.4f (T in [%.3f, %.3f])" % (n, window_halfwidth(TOL, T0.mu, a_at(Tn), T0.w), a_at(Tn),
          Tn - window_halfwidth(TOL, T0.mu, a_at(Tn), T0.w), Tn + window_halfwidth(TOL, T0.mu, a_at(Tn), T0.w)))
for zeta in (0.0, 0.02, 0.05, 0.10):
    t = Tank(zeta=zeta)
    Ts = fastest_safe_time(t, D, AMAX, TOL)
    print("zeta=%.2f  fastest safe T = %.3f s  (%.0f%% slower than twin's %.3f s)" % (zeta, Ts, 100 * (Ts / Tm - 1), Tm))

print("\n== 4. Twin calibrated at full tank (w_model = %.4f), plan T_n = 4 pi n / w_model, tank filled to f; distance D = %g m fixed ==" % (T0.w, D))
print("fill f   w_real   eps=w/w_model-1   residual at n=1, 2, 4, 8 (m; closed form)      smallest safe n   T (s)   recalibrated T (s)   envelope T (s)")
for f in (1.0, 0.9, 0.75, 0.5, 0.25, 0.1):
    t = T0.with_fill(f)
    eps = t.w / T0.w - 1
    rs = [planned_residual(t, T0.w, D, n) for n in (1, 2, 4, 8)]
    ns = smallest_safe_order(t, T0.w, D, TOL, AMAX)
    nr = smallest_safe_order(t, t.w, D, TOL, AMAX)
    print("%5.2f   %6.4f   %+14.4f   %s   %14s   %6.2f   %17.2f   %13.2f" % (f, t.w, eps, "  ".join("%.5f" % r for r in rs), ns,
          planned_time(T0.w, ns), planned_time(t.w, nr), envelope_time(t, D, TOL)))
print("exact propagation check of the closed form at f = 0.5:")
t = T0.with_fill(0.5)
for n in (1, 2, 4, 8):
    T = planned_time(T0.w, n)
    print("  n=%d  T=%.3f s  closed form %.6f  exact %.6f" % (n, T, planned_residual(t, T0.w, D, n), residual(t, D, T)))

print("\n== 5. Same calibration error but at fixed acceleration a0 = %g m/s^2 (distance grows with n): the order threshold asin(sqrt(rho))/(pi|eps|) ==" % AMAX)
print("fill f   eps        first unsafe n   threshold (first unsafe = floor + 1)")
for f in (0.9, 0.75, 0.5, 0.25):
    t = T0.with_fill(f)
    eps = t.w / T0.w - 1
    print("%5.2f   %+.4f   %14s   %8.2f" % (f, eps, first_unsafe_order_fixed_accel(t, T0.w, AMAX, TOL), order_estimate(TOL, t.mu, AMAX, t.w, eps)))
