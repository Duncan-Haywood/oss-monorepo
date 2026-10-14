"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from demo_twin import *

A, B, S2, U = 1.05, 1.0, 1.0, 1.0
G = Grid(12.0, 0.1)
PLANT = (A, B, S2)
K0 = lq_gain(A, B)
JE = stationary_cost(A, B, S2, U, K0, grid=G)
gap = lambda k: stationary_cost(A, B, S2, U, k, grid=G) - JE

print("Plant x'=%.2f x + %.1f sat(u) + w, w~N(0,%.1f), |u|<=%.1f, cost x^2+0.1 u^2. Expert command u=-k0 x, k0=%.4f (unsaturated LQ gain)." % (A, B, S2, U, K0))
print("Stationary laws on a grid of width 0.1 (deterministic). 'gap' = real cost of the clone minus real cost of the expert, both clipped.")

print("\n== 1. Checks ==")
g, p = stationary(A, B, S2, U, K0, G)
exx = moments(g, p, U, K0)[0]
print("expert stationary E x^2 = %.4f, expert cost (grid h=0.1) = %.4f" % (exx, JE))
for h in (0.2, 0.1, 0.05):
    print("grid h=%.2f: expert cost %.4f" % (h, stationary_cost(A, B, S2, U, K0, grid=Grid(12.0, h))))
mc = [simulate_cost(A, B, S2, U, K0, 2000000, s) for s in (1, 2, 3)]
print("Monte Carlo expert cost, 3 runs of 2e6 steps: %s (mean %.4f)" % (", ".join("%.4f" % m for m in mc), sum(mc) / 3))
kb = twin_bc_gain((A, B, S2, U), K0, G)
print("Stein closed form k0*P(|k0 x|<U) with Gaussian x of the expert's variance: %.4f;  exact grid clone gain: %.4f" % (bc_gain_gaussian(K0, exx, U), kb))

print("\n== 2. Perfect twin: cloning applied (clipped) actions, by real actuator limit U (twin uses the same U and noise) ==")
print("U    sd(x)   k0/k_clone     P(sat)   gap     gap/J_expert")
for Uu in (0.8, 1.0, 1.25, 1.5, 2.0, 3.0):
    gg, pp = stationary(A, B, S2, Uu, K0, G)
    ex = moments(gg, pp, Uu, K0)[0]
    psat = 1 - gaussian_sat_prob(K0, ex, Uu)
    kk = bc_gain(gg, pp, Uu, K0)
    je = stationary_cost(A, B, S2, Uu, K0, grid=G)
    if math.isinf(je):
        print("%-4.2f %-7.3f expert itself is unstable under this limit (state escapes the grid); clone gain %.4f" % (Uu, math.sqrt(ex), kk))
        continue
    gp = stationary_cost(A, B, S2, Uu, kk, grid=G) - je
    print("%-4.2f %-7.3f %.4f / %.4f  %-8.3f %-7.4f %.2f%%" % (Uu, math.sqrt(ex), K0, kk, psat, gp, 100 * gp / je))
print("Logging the commanded (pre-clip) action returns k0 exactly: gap 0 by construction.")
kbest, jbest = best_linear_gain(PLANT, U, grid=G)
print("Best clipped-linear gain on the real plant (U=1): %.4f, cost %.4f (expert %.4f)" % (kbest, jbest, JE))

print("\n== 3. Twin errors, one at a time (clone trained on applied actions of the expert run in the twin; U real = 1) ==")
print("twin noise x s2:   " + "  ".join("%g" % m for m in (0.25, 0.5, 0.75, 1, 1.5, 2)))
row = [(twin_bc_gain((A, B, S2 * m, U), K0, G)) for m in (0.25, 0.5, 0.75, 1, 1.5, 2)]
print("clone gain:        " + "  ".join("%.3f" % k for k in row))
print("gap:               " + "  ".join("%.4f" % gap(k) for k in row))
print("twin b-hat / b:    " + "  ".join("%g" % m for m in (0.7, 0.85, 1, 1.2, 1.5)))
row = [twin_bc_gain((A, B * m, S2, U), K0, G) for m in (0.7, 0.85, 1, 1.2, 1.5)]
print("clone gain:        " + "  ".join("%.3f" % k for k in row))
print("gap:               " + "  ".join("%.4f" % gap(k) for k in row))
print("twin a-hat:        " + "  ".join("%g" % m for m in (0.8, 0.95, 1.05, 1.1)))
row = [twin_bc_gain((m, B, S2, U), K0, G) for m in (0.8, 0.95, 1.05, 1.1)]
print("clone gain:        " + "  ".join("%.3f" % k for k in row))
print("gap:               " + "  ".join("%.4f" % gap(k) for k in row))
print("twin limit U-hat:  " + "  ".join("%g" % m for m in (0.7, 1.0, 1.5, 2.0, 3.0)))
row = [twin_bc_gain((A, B, S2, m), K0, G) for m in (0.7, 1.0, 1.5, 2.0, 3.0)]
print("clone gain:        " + "  ".join("%.3f" % k for k in row))
print("gap:               " + "  ".join("%.4f" % gap(k) for k in row))

print("\n== 4. Coverage the twin can impose: logs from states reset to N(0, v) (Stein closed form for the gain) ==")
print("sd(x) of logged states / (U/k0)   clone gain (Stein)   clone gain (grid)   gap")
for r in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0):
    v = (r * U / K0) ** 2
    ks = bc_gain_gaussian(K0, v, U)
    kg = bc_gain(G, gaussian_masses(G, v), U, K0)
    print("%-33.2f %-19.4f %-19.4f %.4f" % (r, ks, kg, gap(ks)))

print("\n== 5. DAgger with applied-action labels (relabel the states the clone visits) ==")
kd, path = dagger_gain(PLANT, U, K0, grid=G)
print("real-plant DAgger path: " + " -> ".join("%.4f" % k for k in path[:8]) + " ... fixed point %.4f, gap %.4f" % (kd, gap(kd)))
print("one-shot clone from perfect-twin logs: gain %.4f, gap %.4f" % (kb, gap(kb)))
tw, path = dagger_gain((A, B, 0.5 * S2), U, K0, grid=G)
print("DAgger inside a twin with half the noise: fixed point %.4f, real gap %.4f" % (tw, gap(tw)))
