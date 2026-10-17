"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from roundtrip_twin.model import (real_energy, twin_energy, ratio, v_opt_real, regret, one_leg_energy, breakeven_margin,
                                  simulate_roundtrip)

print("Roundtrip twin: out-and-back leg D = 1 at airspeed v (units of V0), along-track wind w (headwind out, tailwind back), P(v) = (v^3 + 1/v)/2")

print("\n== 1. Closed form vs time-stepped simulation (dt = 1e-4) ==")
for v, w in ((1.4, 0.5), (1.0, 0.3), (2.0, 1.0)):
    print("v=%.1f w=%.1f: simulated %.5f closed form %.5f" % (v, w, simulate_roundtrip(v, w), real_energy(v, w)))

print("\n== 2. Real / zero-wind-twin energy = 1/(1-(w/v)^2) (same for headwind out or back: wind does not cancel) ==")
print("w/v    ratio   (extra energy, and battery margin needed for the twin's plan)")
for x in (0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 0.99):
    print("%-6.2f %-7.3f +%.1f%%" % (x, 1 / (1 - x * x), 100 * breakeven_margin(1.0, x)))
print("At v = 1.5 (a cruise 50%% above V0), w = 0.75 = half the airspeed: real/twin = %.3f; at w >= v the vehicle never returns." % ratio(1.5, 0.75))

print("\n== 3. Optimal airspeed: twin says v = 1 for every wind; real u* = v^2 = w^2 + sqrt(w^4+1) ==")
print("w      v*_real  E(v*)    E(1)     regret of flying the twin optimum")
for w in (0.0, 0.2, 0.4, 0.6, 0.8, 0.95):
    vs = v_opt_real(w)
    print("%-6.2f %-8.4f %-8.4f %-8.4f %.2f%%" % (w, vs, real_energy(vs, w), real_energy(1.0, w), 100 * regret(w)))
print("Twin's claimed energy at v=1 is %.3f for every w; real at w=0.8 is %.3f (%.2fx). At w >= 1 the twin-optimal v=1 cannot return at all." % (twin_energy(1.0), real_energy(1.0, 0.8), real_energy(1.0, 0.8) / twin_energy(1.0)))

print("\n== 4. A twin calibrated on ONE leg (effective wind w_c = +w headwind leg, -w tailwind leg), assuming the return is the same ==")
v = 1.5
print("v = 1.5; real round-trip energy vs one-leg-twin prediction")
print("w     real     headwind-leg twin     tailwind-leg twin")
for w in (0.1, 0.3, 0.5, 0.75, 1.0, 1.3):
    r = real_energy(v, w)
    h, t = one_leg_energy(v, w), one_leg_energy(v, -w)
    print("%-5.2f %-8.4f %-8.4f (%+.1f%%)    %-8.4f (%+.1f%%)" % (w, r, h, 100 * (h / r - 1), t, 100 * (t / r - 1)))
print("Exactly: one-leg prediction / real = 1 + w/v (headwind leg) and 1 - w/v (tailwind leg); the zero-wind twin is off by the factor 1 - (w/v)^2, second order.")

print("\n== 5. Stall boundary: fraction of uniform winds w ~ U[-a, a] for which the plan at airspeed v fails to return ==")
for v, a in ((1.0, 0.5), (1.0, 1.0), (1.0, 1.5), (1.5, 1.5), (1.5, 2.0)):
    print("v=%.1f a=%.1f: P(|w| >= v) = %.3f" % (v, a, max(0.0, 1 - v / a)))
