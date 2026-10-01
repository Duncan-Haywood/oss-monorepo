"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from gyro_twin.model import (var_heading, var_heading_discrete, var_cross_track, allan_var, t_cross, n_fit,
                             solve_interval, simulate, rate_record, overlapping_allan)

N, K = 0.005, 1e-4          # deg/sqrt(s) (0.3 deg/sqrt(h)), deg/s/sqrt(s)
R = math.radians(1.0)
Phi = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
print("Gyro twin: real = white noise N=%g deg/sqrt(s) plus bias random walk K=%g deg/s/sqrt(s); twin = white noise only (K=0)." % (N, K))
print("crossover t* = sqrt(3) N / K = %.1f s (also the Allan-variance minimum)" % t_cross(N, K))

print("\n== 1. Heading std: Monte Carlo (dt=0.5 s, 2000 paths) vs exact discrete vs continuous closed form vs white-only twin ==")
print("(ratio real/twin variance = 1 + (t/t*)^2)")
rng = random.Random(1)
dt, ts = 0.5, (1, 10, 100, 300, 1000)
steps = [int(t / dt) for t in ts]
acc = {s: 0.0 for s in steps}
P = 2000
for _ in range(P):
    o = simulate(steps[-1], dt, N, K, rng, record_at=steps)
    for s in steps:
        acc[s] += o[s][0] ** 2
print("     t   MC std    exact discrete   continuous   twin (K=0)   var ratio real/twin   1+(t/t*)^2")
for t, s in zip(ts, steps):
    print("%6d   %.4f   %14.4f   %10.4f   %10.4f   %19.3f   %10.3f" % (t, math.sqrt(acc[s] / P), math.sqrt(var_heading_discrete(s, dt, N, K)),
          math.sqrt(var_heading(t, N, K)), math.sqrt(var_heading(t, N, 0)), var_heading(t, N, K) / var_heading(t, N, 0), 1 + (t / t_cross(N, K)) ** 2))

print("\n== 2. Allan deviation from one simulated record (dt=0.1 s, 20000 s, overlapping) vs N^2/tau + K^2 tau/3 ==")
rng = random.Random(2)
dt = 0.1
rec = rate_record(200000, dt, N, K, rng)
ms = [1, 10, 100, 866, 1000, 10000]
av = overlapping_allan(rec, dt, ms)
print("   tau (s)   Allan dev (sim)   closed form   white-only twin N/sqrt(tau)")
for m, a in zip(ms, av):
    tau = m * dt
    print("%9.1f   %15.5f   %11.5f   %12.5f" % (tau, math.sqrt(a), math.sqrt(allan_var(tau, N, K)), N / math.sqrt(tau)))
best = min(zip(av, ms))
print("smallest simulated Allan deviation at tau = %.1f s (closed form t* = %.1f s)" % (best[1] * dt, t_cross(N, K)))

print("\n== 3. Re-alignment interval so that 2 sigma of heading stays within 1 deg ==")
print("twin calibrated how                      N_fit (deg/sqrt(s))   interval (s)   real P(|heading error| > 1 deg) at that interval")
real_int = solve_interval(1.0, N, K, z=2.0)
rows = [("real (truth)", N, K)]
for tau0 in (1.0, 10.0, 100.0, 1000.0):
    rows.append(("Allan fit at tau0=%g s, K=0" % tau0, n_fit(N, K, tau0), 0.0))
rows.insert(1, ("white-only twin (N, K=0)", N, 0.0))
for name, n_, k_ in rows:
    t = solve_interval(1.0, n_, k_, z=2.0)
    p = 2 * (1 - Phi(1.0 / math.sqrt(var_heading(t, N, K))))
    print("%-38s   %17.5f   %12.1f   %10.4f" % (name, n_, t, p))

print("\n== 4. Single-point Allan fit at tau0 = 100 s: twin/real heading-variance ratio (N_fit^2 + 0)/(N^2 + K^2 t^2/3) over t ==")
nf = n_fit(N, K, 100.0)
print("N_fit = %.5f (true N = %g)" % (nf, N))
print("     t   twin var / real var   (var_twin = N_fit^2 t, var_real = N^2 t + K^2 t^3/3)")
for t in (1, 10, 50, 100, 300, 1000, 3000):
    print("%6d   %18.3f" % (t, nf * nf * t / var_heading(t, N, K)))
print("the fit is exact only at t = tau0 (N_fit^2 = N^2 + K^2 tau0^2/3): ratio at t = 100 is %.3f" % (nf * nf * 100 / var_heading(100, N, K)))

print("\n== 5. Dead reckoning at v = 1 and 5 m/s: distance until 2 sigma cross-track error reaches 1 m ==")
Nr, Kr = N * R, K * R
print("var y = v^2 (N^2 t^3/3 + K^2 t^5/20), N and K in rad units; solved for var <= (1 m / 2)^2")
for v in (1.0, 5.0):
    tr = solve_interval(1.0 / v, Nr, Kr, z=2.0, kind="cross")
    tw = solve_interval(1.0 / v, Nr, 0.0, z=2.0, kind="cross")
    print("v = %.0f m/s: real 2-sigma 1 m reached at t = %.1f s (%.0f m);  twin t = %.1f s (%.0f m);  twin overstates the usable distance by %.2fx" % (v, tr, v * tr, tw, v * tw, tw / tr))
print("MC check at v = 1 m/s, t = real-solution time (dt = 0.5 s, 3000 paths): std of y vs closed form")
tr = solve_interval(1.0, Nr, Kr, z=2.0, kind="cross")
n = int(round(tr / 0.5))
rng = random.Random(4)
ys = [simulate(n, 0.5, Nr, Kr, rng, v=1.0)[n][1] for _ in range(3000)]
print("t = %.1f s: MC std y = %.3f m, closed form = %.3f m (target 0.5 m), twin std at same t = %.3f m" % (n * 0.5, math.sqrt(sum(y * y for y in ys) / len(ys)),
      math.sqrt(var_cross_track(n * 0.5, Nr, Kr)), math.sqrt(var_cross_track(n * 0.5, Nr, 0.0))))
