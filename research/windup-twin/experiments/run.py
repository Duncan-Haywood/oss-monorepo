"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from windup_twin.model import gains, sat, simulate, overshoot, settle_time, saturated_phase

DT = 2e-3
INF = 1e9
print("Windup twin: x' = sat_U(u) + d, z' = x, u = -kp x - ki z, kp = 2 zeta wn, ki = wn^2, U = 1. Twin: U = inf, d = 0. x(0) = x0, z(0) = 0.")


def run(wn, zeta, x0, U=1.0, d=0.0, aw=False, T=None, dt=DT):
    kp, ki = gains(wn, zeta)
    if T is None:
        T = 40.0 / (zeta * wn) + max(12.0 * abs(x0) / U, 0.5 * x0 * x0 / U)
    xs, zs = simulate(kp, ki, U, x0, T, d=d, dt=dt, antiwindup=aw)
    return xs, zs, kp, ki


print("\n== 1. Twin validity region, zeta = 0.7, wn = 1 (kp = 1.4, ki = 1): twin max |u| = kp x0 ==")
xs, zs, kp, ki = run(1.0, 0.7, 1.0, U=INF, T=60.0)
tw_os = overshoot(xs, 1.0)
print("twin overshoot (initial-condition response, z(0) = 0): %.4f, twin settle time %.3f (x0-independent)" % (tw_os, settle_time(xs, 1.0, DT)))
print("x0     kp*x0/U  max|x_real - x_twin|/x0   real overshoot   real settle   twin settle")
for x0 in (0.1, 0.5, 0.7, 0.72, 0.8, 1.0, 1.5, 2.0):
    xr, _, _, _ = run(1.0, 0.7, x0, T=60.0)
    xt, _, _, _ = run(1.0, 0.7, x0, U=INF, T=60.0)
    err = max(abs(a - b) for a, b in zip(xr, xt)) / x0
    print("%-6g %-8.3f %-26.3e %-16.4f %-13.3f %.3f" % (x0, kp * x0, err, overshoot(xr, x0), settle_time(xr, x0, DT), settle_time(xt, x0, DT)))
print("(the twin is exact iff kp x0 <= U = 1, i.e. x0 <= %.4f)" % (1 / kp))

print("\n== 2. Windup: step x0 in units of U, zeta = 0.7, wn = 1 ==")
print("x0/U   real overshoot  real settle  peak z   x0^2/(2U)   clamped overshoot  clamped settle  peak z   twin overshoot  twin settle")
for x0 in (0.5, 1, 2, 5, 10, 20, 50):
    xr, zr, kp, ki = run(1.0, 0.7, x0)
    xa, za, _, _ = run(1.0, 0.7, x0, aw=True)
    print("%-6g %-15.4f %-12.3f %-8.3f %-11.3f %-18.4f %-15.3f %-8.3f %-15.4f %.3f" % (
        x0, overshoot(xr, x0), settle_time(xr, x0, DT), max(zr), x0 * x0 / 2, overshoot(xa, x0), settle_time(xa, x0, DT), max(za), tw_os,
        settle_time(run(1.0, 0.7, x0, U=INF, T=60.0)[0], x0, DT)))

print("\n== 3. Exact saturated phase (x0 > U/kp): x(t) = x0 - U t, z(t) = x0 t - U t^2/2, exit when kp x + ki z = U ==")
print("x0   exit time (formula)   exit time (sim)   z at exit (formula)   z at exit (sim)   peak z = x0^2/(2U) needs x0^2 >= 2U^2/ki = %.3f" % (2.0 / ki))
for x0 in (2.0, 5.0, 10.0):
    te, ze = saturated_phase(kp, ki, 1.0, x0)
    dt = 1e-4
    xs2, zs2 = simulate(kp, ki, 1.0, x0, te + 1.0, dt=dt)
    k = next(i for i in range(len(xs2)) if kp * xs2[i] + ki * zs2[i] <= 1.0)
    print("%-4g %-20.5f %-17.5f %-21.5f %.5f" % (x0, te, k * dt, ze, zs2[k]))

print("\n== 4. Constant load d (integrator must supply -d), x0 = 5, zeta = 0.7, wn = 1, U = 1, T = 4000 ==")
print("d/U    real settle time   final x   (twin has d = 0 and settles in %.3f)" % settle_time(run(1.0, 0.7, 5.0, U=INF, T=60.0)[0], 5.0, DT))
for d in (0.0, 0.5, 0.8, 0.9, 0.95, 0.99, 1.0, 1.05):
    xr, _, _, _ = run(1.0, 0.7, 5.0, d=d, T=4000.0, dt=5e-3)
    st = settle_time(xr, 5.0, 5e-3)
    print("%-6g %-18s %.4g" % (d, "never (drifts)" if math.isinf(st) else "%.2f" % st, xr[-1]))

print("\n== 5. Is a faster twin-tuned loop better? zeta = 0.7, x0 = 5, U = 1 ==")
print("wn    twin decay zeta*wn   twin settle   real settle   real overshoot   clamped settle   clamped overshoot")
for wn in (0.25, 0.5, 1.0, 2.0, 4.0, 8.0):
    xr, _, _, _ = run(wn, 0.7, 5.0, T=800.0, dt=min(DT, 0.02 / wn))
    xa, _, _, _ = run(wn, 0.7, 5.0, aw=True, T=800.0, dt=min(DT, 0.02 / wn))
    xt, _, _, _ = run(wn, 0.7, 5.0, U=INF, T=60.0 / wn, dt=min(DT, 0.02 / wn))
    d_ = min(DT, 0.02 / wn)
    print("%-5g %-20.3f %-13.3f %-13.3f %-16.4f %-16.3f %.4f" % (wn, 0.7 * wn, settle_time(xt, 5.0, d_), settle_time(xr, 5.0, d_), overshoot(xr, 5.0),
                                                                settle_time(xa, 5.0, d_), overshoot(xa, 5.0)))
