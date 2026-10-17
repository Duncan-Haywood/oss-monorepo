"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
from flex_twin.model import (eps_crit, eps_crit_cubic, params, real_stable, settle_time, simulate, twin_gains)

print("Flex twin: rigid twin (inertia M) vs real two-mass plant, load-side PD.  eps = w/ws, zeta = twin damping ratio, delta = modal damping ratio, mu = J1 J2 / M^2.")

print("\n== 1. Critical bandwidth eps_c is independent of the mass ratio (zeta = 0.7, delta = 0.05) ==")
vals = []
for mu in (0.01, 0.05, 0.1, 0.2, 0.25):
    e = eps_crit(mu, 0.05, 0.7)
    vals.append(e)
    print("mu = %-5g eps_c = %.12f" % (mu, e))
print("max spread over mu: %.1e" % (max(vals) - min(vals)))
worst = 0.0
for d in (0.005, 0.01, 0.02, 0.05, 0.1, 0.2):
    for z in (0.5, 0.7, 1.0):
        worst = max(worst, abs(eps_crit(0.2, d, z) - eps_crit_cubic(d, z)))
print("max |bisection on Routh - root of the cubic| over 18 (delta, zeta) pairs: %.1e" % worst)

print("\n== 2. eps_c and the small-damping law eps_c ~ delta/zeta ==")
print("delta    zeta=0.5   zeta=0.7   zeta=1.0    | eps_c*zeta/delta at zeta=0.5, 0.7, 1.0")
for d in (0.005, 0.01, 0.02, 0.05, 0.1, 0.2):
    es = [eps_crit_cubic(d, z) for z in (0.5, 0.7, 1.0)]
    print("%-8g %-10.5f %-10.5f %-11.5f | %.4f  %.4f  %.4f" % (d, es[0], es[1], es[2], es[0] * 0.5 / d, es[1] * 0.7 / d, es[2] / d))
print("undamped flexible mode (delta = 0): stable at any eps? ", [real_stable(0.2, 0.0, e, 0.7) for e in (1e-6, 1e-3, 0.1, 1.0, 10.0)])

print("\n== 3. Collocated (motor-side) sensing: Routh-Hurwitz on a grid ==")
n = bad = 0
for mu in (0.01, 0.05, 0.1, 0.2, 0.25):
    for d in (0.0, 0.001, 0.01, 0.1, 0.5, 1.0):
        for z in (0.1, 0.5, 1.0, 3.0):
            for k in range(-30, 31):
                eps = 10 ** (k / 10)        # 1e-3 .. 1e3
                n += 1
                bad += not real_stable(mu, d, eps, z, collocated=True)
print("%d grid points, %d unstable" % (n, bad))

print("\n== 4. Twin vs real step response (delta = 0.05, zeta = 0.7, mu = 0.2, unit step, dt = 0.01) ==")
d, z, mu = 0.05, 0.7, 0.2
J1, J2, k, c = params(mu, d)
ec = eps_crit(mu, d, z)
print("eps_c = %.5f" % ec)
print("eps/eps_c  eps      twin ts(2%)  real ts(2%)   max|y_real - y_twin|   real peak")
for f in (0.05, 0.1, 0.25, 0.5, 0.75, 0.9):
    eps = f * ec
    kp, kd = twin_gains(1.0, eps, z)
    T = 60.0 / (z * eps)
    dt = 0.01
    if T / dt > 600000:
        dt = T / 600000
    nsteps = int(T / dt)
    yt = simulate(J1, J2, k, c, kp, kd, nsteps, dt, r=1.0, twin=True)
    yr = simulate(J1, J2, k, c, kp, kd, nsteps, dt, r=1.0)
    tt, tr = settle_time(yt, dt, 1.0), settle_time(yr, dt, 1.0)
    print("%-10g %-8.5f %-12s %-13s %-22.3e %.4f" % (f, eps, "%.1f" % tt if tt is not None else "-", "%.1f" % tr if tr is not None else "never",
                                                  max(abs(a - b) for a, b in zip(yt, yr)), max(yr)))

print("\n== 5. Simulation agrees with Routh on both sides of eps_c (delta = 0.2, zeta = 0.7, mu = 0.2; 600 time units from x2 = 1) ==")
d, z, mu = 0.2, 0.7, 0.2
J1, J2, k, c = params(mu, d)
ec = eps_crit(mu, d, z)
print("eps_c = %.5f" % ec)
for f in (0.7, 0.9, 1.1, 1.6):
    kp, kd = twin_gains(1.0, f * ec, z)
    ys = simulate(J1, J2, k, c, kp, kd, 60000, 0.01, x2_0=1.0)
    early = max(abs(y) for y in ys[2000:6000])
    late = max(abs(y) for y in ys[-4000:])
    print("eps/eps_c = %-4g Routh-stable %-5s  max|y| t in [20,60] %.3e   t in [560,600] %.3e" % (f, real_stable(mu, d, f * ec, z), early, late))

print("\n== 6. Mis-stated modal damping: a twin with delta_twin = f * delta_real certifies eps_c(delta_twin) (zeta = 0.7) ==")
print("delta_real  f      certified eps   real eps_c   ratio   real stable at half the certified eps?   at 0.8 of it?")
for dr in (0.01, 0.05, 0.2):
    for f in (0.5, 1.25, 1.5, 2.0, 3.0, 5.0):
        ct = eps_crit_cubic(f * dr, 0.7)
        rc = eps_crit_cubic(dr, 0.7)
        print("%-11g %-6g %-15.5f %-12.5f %-7.3f %-39s %s" % (dr, f, ct, rc, ct / rc, real_stable(0.2, dr, 0.5 * ct, 0.7), real_stable(0.2, dr, 0.8 * ct, 0.7)))
print("largest f for which a design at fraction m of the twin-certified eps is stable for the real plant (delta_real = 0.05):")
for m in (1.0, 0.8, 0.5, 0.25):
    lo, hi = 1.0, 100.0
    for _ in range(100):
        f = 0.5 * (lo + hi)
        if real_stable(0.2, 0.05, m * eps_crit_cubic(f * 0.05, 0.7), 0.7):
            lo = f
        else:
            hi = f
    print("m = %-5g f_max = %.4f" % (m, lo))
