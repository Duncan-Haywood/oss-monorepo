"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random

from sag_twin.model import (D, VC, emf, current, voltage, eta, s_cut, max_power, endurance, twin_endurance, simulate,
                            fit_resistance, twin_current)

print("Sag twin: battery OCV e(s) = 1 - %.2f(1-s), cutoff vc = %.2f (units of E0), constant power u0 = 4 R0 P/E0^2, time in units R0 Q/E0." % (D, VC))
print("Twin: same OCV curve, no internal resistance (i = u0/(4e)).  Real: i = (e - sqrt(e^2 - r u0))/(2r), dropped at v < vc.")

print("\n== 1. Flat EMF (d = 0, no cutoff): endurance ratio real/twin = eta(u) = (1+sqrt(1-u))/2, fold at u = 1 ==")
print("u0     twin T      real T (quadrature)  real/twin  eta(u)     twin overstates by 1/eta")
for u in (0.05, 0.2, 0.4, 0.6, 0.8, 0.95, 1.0):
    tw = twin_endurance(u, d=0.0)
    re = endurance(u, s_to=0.0, d=0.0, vc=0.0)
    print("%-6g %-11.3f %-20.3f %-10.4f %-10.4f %.3f" % (u, tw, re, re / tw, eta(u), 1 / eta(u)))
print("u0 = 1.05: real current = %s (no steady delivery); twin endurance = %.3f" % (current(1.0, 1.05, d=0.0), twin_endurance(1.05, d=0.0)))

print("\n== 2. With OCV droop and cutoff (rho = 0): stranded charge and endurance ==")
print("u0     twin T   real T   real/twin  s_cut (stranded charge)  Euler sim T (dt=2e-4)")
for u in (0.05, 0.10, 0.20, 0.30, 0.40, 0.60, 0.80):
    sc = s_cut(u)
    tw = twin_endurance(u)
    re = endurance(u)
    ts, _ = simulate(u, dt=2e-4)
    print("%-6g %-8.3f %-8.3f %-10.4f %-24.4f %.3f" % (u, tw, re, re / tw, sc, ts))
print("largest power that can start from full charge 4 vc (1-vc) = %.4f; u0 = 0.9 starts: %s (twin endurance %.3f)" % (4 * VC * (1 - VC), s_cut(0.9), twin_endurance(0.9)))

print("\n== 3. Burst reserve: lowest state of charge from which a burst u2 can still be delivered (rho = 0) ==")
print("burst u2   max-power fraction of full-charge limit   s_floor (burst fails below)   twin floor")
full = max_power(1.0)
for u2 in (0.10, 0.20, 0.28, 0.40, 0.50, 0.60, 0.70, 0.80):
    print("%-10g %-44.3f %-28.4f %.1f" % (u2, u2 / full, s_cut(u2), 0.0))
print("max deliverable power at s = 1, 0.8, 0.6, 0.4, 0.2, 0: " + ", ".join("%.3f" % max_power(s) for s in (1, 0.8, 0.6, 0.4, 0.2, 0.0)))
print("a flat 20%% charge reserve covers bursts up to u2 = %.3f (%.0f%% of the full-charge limit)" % (max_power(0.2), 100 * max_power(0.2) / full))

print("\n== 4. Cruise u1 = 0.2 then a final burst u2: cruise time before the burst can no longer be guaranteed ==")
u1 = 0.2
print("twin cruise T to empty %.3f; real cruise T to its own cutoff %.3f" % (twin_endurance(u1), endurance(u1)))
print("u2     s_floor  real cruise T down to s_floor  /twin T  /real-to-cutoff T")
for u2 in (0.28, 0.40, 0.50, 0.60, 0.70):
    sf = s_cut(u2)
    T = endurance(u1, s_to=sf)
    print("%-6g %-8.4f %-31.3f %-8.3f %.3f" % (u2, sf, T, T / twin_endurance(u1), T / endurance(u1)))

print("\n== 5. Cold cell: R0 multiplied by k at a fixed physical power (u0 -> k u0), base u0 = 0.2 ==")
print("k      u0_eff  starts?  real T   twin T (blind to k)  real/twin  max power from full (units E0^2/(4 R0 warm))")
base = 0.2
for k in (1.0, 1.5, 2.0, 3.0, 4.0, 4.5):
    u = k * base
    sc = s_cut(u)
    T = endurance(u) if sc is not None else 0.0
    print("%-6g %-7.2f %-8s %-8.3f %-29.3f %-10.4f %.3f" % (k, u, "yes" if sc is not None else "NO", T, twin_endurance(base) , T / twin_endurance(base), full / k))

print("\n== 6. Constant-derate refit: fit eta_fit = real/twin endurance at u_fit, predict T = eta_fit * twin T elsewhere (rho = 0) ==")
for ufit in (0.10, 0.30):
    ef = endurance(ufit) / twin_endurance(ufit)
    print("fit at u_fit = %.2f: eta_fit = %.4f" % (ufit, ef))
    print("   u0     real T   refit T   refit error")
    for u in (0.05, 0.10, 0.20, 0.30, 0.50, 0.70, 0.80):
        re = endurance(u)
        pr = ef * twin_endurance(u)
        print("   %-6g %-8.3f %-9.3f %+.1f%%" % (u, re, pr, 100 * (pr / re - 1)))
    print("   u0 = 0.90 (cannot start): real T = 0, refit predicts %.3f" % (ef * twin_endurance(0.9)))

print("\n== 7. Identifying R0 from a short logged segment (noise sd 0.005 E0 on v, currents from the u0 = 0.1 and 0.4 segments, s in [0.9, 1]) ==")
rng = random.Random(7)
print("n samples  mean R-hat/R0  sd R-hat/R0 (Monte Carlo, 2000 reps)  predicted sd = sigma/sqrt(sum i^2)")
for n in (10, 40, 160):
    ss = [1 - 0.1 * (k + 0.5) / n for k in range(n)]
    ii = [current(s, 0.1 if k % 2 == 0 else 0.4) for k, s in enumerate(ss)]
    ee = [emf(s) for s in ss]
    vv0 = [voltage(s, 0.1 if k % 2 == 0 else 0.4) for k, s in enumerate(ss)]
    est = []
    for _ in range(2000):
        vv = [v + rng.gauss(0, 0.005) for v in vv0]
        est.append(fit_resistance(ii, ee, vv)[0])
    m = sum(est) / len(est)
    sd = math.sqrt(sum((x - m) ** 2 for x in est) / (len(est) - 1))
    _, den = fit_resistance(ii, ee, vv0)
    print("%-10d %-14.4f %-37.4f %.4f" % (n, m, sd, 0.005 / math.sqrt(den)))
print("(one short high-power segment identifies R0: unlike thermal-twin or stiction-twin the sag shows at once in the terminal voltage)")

print("\n== 8. Out-of-model: resistance rising as the cell empties R(s) = R0(1 + rho(1-s)); a twin with constant R0 fitted at full charge ==")
print("rho  u0    real s_cut  const-R twin s_cut  real T   const-R twin T  twin error   real floor for burst 0.5   const-R twin floor")
for rho in (0.0, 1.0, 2.0):
    for u in (0.1, 0.3):
        sr = s_cut(u, rho=rho)
        st = s_cut(u, rho=0.0)
        tr = endurance(u, rho=rho)
        tt = endurance(u, rho=0.0)
        print("%-4g %-5g %-11.4f %-19.4f %-8.3f %-15.3f %+8.1f%%   %-26.4f %.4f" % (rho, u, sr, st, tr, tt, 100 * (tt / tr - 1), s_cut(0.5, rho=rho), s_cut(0.5, rho=0.0)))
