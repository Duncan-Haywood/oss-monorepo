"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tests"))
from sync_twin import *
from test_model import simulate

S2, ELL = 1.0, 1.0   # signal variance; time in units of the signal length scale
A, B = 0.01, 0.04    # noise variances: A on the reference clock (sd 0.1), B delayed (sd 0.2)
print("Sensors A (reference clock, noise var %g) and B (var %g, clock error u=delta+J) observe x(t): SE kernel, var %g, length scale 1 (time unit)." % (A, B, S2))
print("Twin: both sensors on one simulated clock, weight on A = b/(a+b) = %.3f, claimed MSE = ab/(a+b) = %.5f." % (twin_weight(A, B), twin_claim(A, B)))

print("\n== 1. Closed form vs simulation (200000 draws): real MSE of the twin-designed fusion ==")
print("delta  jitter  g(closed)  MSE(closed)  MSE(sim)   MSE/claim")
for d, s in ((0.0, 0.0), (0.1, 0.0), (0.0, 0.1), (0.2, 0.1), (0.5, 0.0), (0.3, 0.3)):
    g = timing_var(S2, ELL, d, s)
    m = real_mse_twin_weight(A, B, g)
    sim = simulate(A, B, S2, ELL, d, s, twin_weight(A, B), 200000, 5)
    print("%-6g %-7g %-10.5f %-12.5f %-10.5f %.3f" % (d, s, g, m, sim, m / twin_claim(A, B)))

print("\n== 2. Offset and jitter add in quadrature for small errors: g ~ s2*(delta^2+s^2)/ell^2 ==")
print("delta  jitter  g(exact)   s2*(d^2+s^2)  ratio")
for d, s in ((0.05, 0.05), (0.1, 0.1), (0.2, 0.0), (0.0, 0.2), (0.3, 0.3), (0.6, 0.6)):
    g = timing_var(S2, ELL, d, s)
    print("%-6g %-7g %-10.5f %-13.5f %.3f" % (d, s, g, S2 * (d * d + s * s) / ELL ** 2, g / (S2 * (d * d + s * s))))

print("\n== 3. Excess over the twin's claim: MSE/claim = 1 + a*g/(b*(a+b)); pure offset delta (units of ell) ==")
print("delta  g         MSE/claim  real MSE   A alone   B alone(b+g)  optimal(known g)")
for d in (0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2):
    g = timing_var(S2, ELL, d, 0.0)
    print("%-6g %-9.5f %-10.3f %-10.5f %-9.5f %-13.5f %.5f" % (d, g, excess_ratio(A, B, g), real_mse_twin_weight(A, B, g), A, B + g, opt_mse(A, B, g)))
print("Break-even: twin-weight fusion is worse than A alone iff g > a+b = %.3f, i.e. pure offset delta > %.3f ell." % (breakeven_g(A, B), g_to_rms(breakeven_g(A, B), S2, ELL)))

print("\n== 4. The better the delayed sensor, the more it hurts (fixed g = 0.02, a = 0.01) ==")
print("b      weight on B  MSE/claim  real MSE   A alone  optimal(known g)")
for b in (0.005, 0.01, 0.02, 0.04, 0.16, 0.64):
    g = 0.02
    print("%-6g %-12.3f %-10.3f %-10.5f %-8.5f %.5f" % (b, 1 - twin_weight(A, b), excess_ratio(A, b, g), real_mse_twin_weight(A, b, g), A, opt_mse(A, b, g)))

print("\n== 5. Sync budget: largest RMS timing error (units of ell) keeping real MSE <= (1+eps)*claim, and what it is in ms for ell = 0.3 s ==")
print("eps    g_max     pure-offset delta_max   small-error approx ell*sqrt(g/s2)   ms at ell=0.3s")
for eps in (0.02, 0.05, 0.1, 0.25, 0.5, 1.0):
    g = budget_g(A, B, eps)
    d = g_to_rms(g, S2, ELL)
    print("%-6g %-9.5f %-23.4f %-35.4f %.0f" % (eps, g, d, ELL * math.sqrt(g / S2), 300 * d))

print("\n== 6. Randomising the twin's clock: weight learned under randomised timing variance g_r, evaluated at true g ==")
print("Real MSE / optimal MSE at true g (a=%g, b=%g)." % (A, B))
for g in (0.005, 0.02, 0.1):
    print("true g = %g (delta ~ %.3f ell); optimal MSE %.5f, twin claim %.5f" % (g, g_to_rms(g, S2, ELL), opt_mse(A, B, g), twin_claim(A, B)))
    print("  g_r/g:     " + "  ".join("%-6g" % r for r in (0, 0.25, 0.5, 1, 2, 4, 10, 100)))
    print("  MSE/opt:   " + "  ".join("%-6.3f" % (wrong_range_mse(A, B, g, r * g) / opt_mse(A, B, g)) for r in (0, 0.25, 0.5, 1, 2, 4, 10, 100)))
