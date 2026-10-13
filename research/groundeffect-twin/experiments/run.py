"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
from groundeffect_twin.model import (ge, dge, equilibrium, offset_approx, simulate_hold, spectral_radius, gain_margin,
                                     real_margin, critical_height, max_gain_scale, simulate_delayed)

Rr = 0.10
print("Ground-effect twin: rotor radius Rr=%g m, G(z)=1/(1-(Rr/4z)^2), gravity feedforward, no integrator" % Rr)

print("\n== 1. Hover offset: PD (kp=25, kd=7) with gravity feedforward; twin predicts zero offset ==")
kp, kd = 25.0, 7.0
print("  zr/Rr  zr     G(zr)   offset_exact[mm]  offset/zr  first-order[mm]  sim_end-zr[mm]")
for r in (3.0, 2.0, 1.5, 1.0, 0.7, 0.6):
    zr = r * Rr
    ze = equilibrium(zr, kp, Rr)
    z_end, v_end = simulate_hold(zr, zr, kp, kd, Rr, dt=0.0005, T=8.0)
    print("  %-5g  %.3f  %.4f  %-16.2f  %-9.1f%% %-15.2f  %.2f" % (r, zr, ge(zr, Rr), 1000 * (ze - zr), 100 * (ze - zr) / zr,
                                                              1000 * offset_approx(zr, kp, Rr), 1000 * (z_end - zr)))

print("\n== 2. Gain margin of the sampled loop (dt=0.02, one-sample delay), designed kp=400 kd=28 ==")
kp, kd, dt = 400.0, 28.0, 0.02
twin_m = gain_margin(kp, kd, dt)
print("  twin gain margin %.4f  (spectral radius at designed gains %.4f)" % (twin_m, spectral_radius(kp, kd, 0.0, dt)))
print("  zr/Rr  G      stiffness S  margin(full)  margin(G only, S=0)  spectral radius")
for r in (3.0, 2.0, 1.5, 1.0, 0.8, 0.7, 0.6, 0.55):
    zr = r * Rr
    ze, G, S, m = real_margin(zr, kp, kd, dt, Rr)
    m0 = real_margin(zr, kp, kd, dt, Rr, with_stiffness=False)[3]
    print("  %-5g  %.4f  %-11.2f  %-12.4f  %-19.4f  %.4f" % (r, G, S, m, m0, spectral_radius(G * kp, G * kd, S, dt)))
zc = critical_height(kp, kd, dt, Rr)
print("  critical target height (real loop on the stability boundary): zr = %.4f m = %.3f Rr; twin predicts stable at every height" % (zc, zc / Rr))
print("  headroom the twin reported: %.1f%%; headroom of the real loop at zr=0.7Rr: %.1f%%" % (100 * (twin_m - 1), 100 * (real_margin(0.7 * Rr, kp, kd, dt, Rr)[3] - 1)))

print("\n== 3. Nonlinear sampled loop, 2 mm initial offset from equilibrium, 20 s: final |z-z_e| and peak (mm) ==")
print("  zr/Rr  real_final  real_peak  twin_final")
for r in (1.0, 0.7, 0.6, 0.57, 0.55, 0.53, 0.5):
    zr = r * Rr
    f, p = simulate_delayed(zr, kp, kd, dt, Rr, 0.002)
    ft, pt = simulate_delayed(zr, kp, kd, dt, Rr, 0.002, use_ge=False)
    fmt = lambda x: "inf" if x == float("inf") else "%.3g" % (1000 * x)
    print("  %-5g  %-10s  %-9s  %s" % (r, fmt(f), fmt(p), fmt(ft)))

print("\n== 4. Gain derating: largest scale on (kp, kd) keeping the real loop stable at target zr (twin: %.4f) ==" % twin_m)
for r in (3.0, 1.0, 0.7, 0.6, 0.55):
    print("  zr/Rr=%-4g max scale %.4f  (%.2f%% below twin)" % (r, max_gain_scale(r * Rr, kp, kd, dt, Rr),
                                                           100 * (1 - max_gain_scale(r * Rr, kp, kd, dt, Rr) / twin_m)))
