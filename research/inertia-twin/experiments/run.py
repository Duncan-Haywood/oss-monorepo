"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from inertia_twin.model import *

A = math.radians(30)
L = 2.0
print("Inertia twin: real = body of inertia I = k m r^2 rolling/slipping on a ramp (exact stick/slip simulation, dt = 1e-4 s); twin = frictionless point mass.")
print("g = %.2f m/s^2, ramp length %.1f m, angle 30 deg unless stated" % (G, L))

print("\n== 1. Down-ramp acceleration from rest, mu = 0.9 (rolling): simulation vs g sin(a)/(1+k), twin g sin(a) ==")
print("shape    k     a sim   a closed   a twin   twin/real   fall time real   fall time twin   time ratio")
for name, k in SHAPES.items():
    x, v, w = simulate(k, A, 0.9, 1.0)
    ar = accel_real(k, A, 0.9)
    at = accel_twin(A)
    print("%-6s %4.2f  %7.4f  %8.4f  %7.4f  %9.4f  %14.4f  %14.4f  %10.4f" % (name, k, 2 * x, ar, at, at / ar, fall_time(ar, L), fall_time(at, L), fall_time(at, L) / fall_time(ar, L)))

print("\n== 2. Slip threshold mu* = k tan(a)/(1+k): acceleration vs friction coefficient (disc, k = 0.5, 30 deg) ==")
k = 0.5
print("mu* = %.4f; twin acceleration %.4f regardless of mu" % (mu_star(k, A), accel_twin(A)))
print("   mu    a sim    a closed   regime    twin/real")
for mu in (0.0, 0.05, 0.10, 0.15, 0.19, 0.20, 0.25, 0.5, 0.9):
    x, v, w = simulate(k, A, mu, 1.0)
    regime = "roll" if abs(v - w) < 1e-6 else "slip"
    ar = accel_real(k, A, mu)
    print("%5.2f  %7.4f  %8.4f   %-6s  %9.4f" % (mu, v, ar, regime, accel_twin(A) / ar))

print("\n== 3. Threshold vs ramp angle: smallest mu that rolls (closed form), and twin/real acceleration when mu = 0.15 ==")
print("angle   mu*(sphere)  mu*(disc)  mu*(hoop)   twin/real sphere   disc   hoop   (mu = 0.15)")
for deg in (5, 10, 20, 30, 45):
    a = math.radians(deg)
    print("%4d   %10.4f  %9.4f  %9.4f   %16.4f %6.4f %6.4f" % ((deg,) + tuple(mu_star(k, a) for k in SHAPES.values()) + tuple(accel_twin(a) / accel_real(k, a, 0.15) for k in SHAPES.values())))

print("\n== 4. Coast distance: twin-trained launch speed to stop at d = 1 m on a 15 deg ramp, body launched rolling ==")
a = math.radians(15)
v0 = launch_speed_twin(a, 1.0)
print("twin launch speed %.4f m/s" % v0)
print("shape    k   real stop distance (closed)   simulated   overshoot")
for name, k in SHAPES.items():
    t_stop = (1 + k) * v0 / (G * math.sin(a))
    x, v, w = simulate(k, a, 0.9, t_stop, v0=-v0, w0=-v0)
    print("%-6s %4.2f   %26.4f   %9.4f   %8.1f%%" % (name, k, coast_distance_real(k, a, v0), -x, 100 * (coast_distance_real(k, a, v0) - 1.0)))

print("\n== 5. One-parameter calibration (fit gain c on the twin acceleration) on one shape, applied to the fleet; fall-time error on a 2 m ramp, 20 deg ==")
a = math.radians(20)
samples = lambda k: [(math.radians(d), accel_real(k, math.radians(d), 0.9)) for d in (10, 15, 20, 25)]
print("fit on   c       sphere err    disc err     hoop err    (fall time, % of real)")
for fit, kf in SHAPES.items():
    c = fit_gain(samples(kf))
    errs = []
    for name, k in SHAPES.items():
        tr = fall_time(accel_real(k, a, 0.9), L)
        tt = fall_time(c * accel_twin(a), L)
        errs.append(100 * (tt - tr) / tr)
    print("%-6s %6.4f   %9.2f%%  %9.2f%%  %9.2f%%" % (fit, c, *errs))
print("\nfleet-mean fit (k in {0.4,0.5,1.0} pooled):")
pool = []
for k in SHAPES.values():
    pool += samples(k)
c = fit_gain(pool)
print("c = %.4f; fall-time error: " % c + ", ".join("%s %.2f%%" % (n, 100 * (fall_time(c * accel_twin(a), L) / fall_time(accel_real(k, a, 0.9), L) - 1)) for n, k in SHAPES.items()))

print("\n== 6. Ranking a race: fall times real vs twin (2 m, 30 deg, mu = 0.9) ==")
for name, k in sorted(SHAPES.items(), key=lambda kv: kv[1]):
    print("%-6s real %.4f s   twin %.4f s" % (name, fall_time(accel_real(k, A, 0.9), L), fall_time(accel_twin(A), L)))
