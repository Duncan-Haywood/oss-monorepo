"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from interleave_twin.model import (q_lag, residual_real, residual_twin, copies_needed_twin, copies_needed_real, best_design,
                                   best_spacing_for_deadline, simulate)

P = 0.2
EPS = 1e-3
print("Interleave twin: real = stationary two-state loss chain (marginal p, lag-1 correlation lam); twin = independent loss, same p")
print("p = %g; a copy is lost if its slot is lost; all copies of an update lost = update lost" % P)

print("\n== 1. Twin design: copies back to back (g=1) for residual <= %g ==" % EPS)
rt = copies_needed_twin(P, EPS)
print("  twin needs r = %d copies, latency %d, claims residual %.3g" % (rt, rt - 1, residual_twin(P, rt)))
print("  lam    real residual of the twin's design    ratio to twin    real copies needed at g=1 (latency)")
for lam in (0.0, 0.3, 0.5, 0.7, 0.8, 0.9):
    res = residual_real(P, lam, rt, 1)
    rr = copies_needed_real(P, lam, EPS, 1)
    print("  %.1f    %-12.3g                          %6.1fx          %d (%d)" % (lam, res, res / residual_twin(P, rt), rr, rr - 1))

print("\n== 2. Two copies: real/twin ratio 1 + lam^g (1-p)/p vs spacing g ==")
print("  g     lam=0.5   lam=0.8   lam=0.9")
for g in (1, 2, 3, 5, 8, 12, 20, 40):
    print("  %-4d  %8.3f  %8.3f  %8.3f" % ((g,) + tuple(residual_real(P, l, 2, g) / residual_twin(P, 2) for l in (0.5, 0.8, 0.9))))
print("  spacing for the 2-copy residual to be within 10% of the twin: g >= ln(0.1 p/(1-p)) / ln(lam)")
for lam in (0.5, 0.8, 0.9):
    g = math.ceil(math.log(0.1 * P / (1 - P)) / math.log(lam))
    print("   lam=%.1f: g = %d (ratio %.3f)" % (lam, g, residual_real(P, lam, 2, g) / residual_twin(P, 2)))

print("\n== 3. Real min-latency design (r, g) for residual <= %g, r <= r_max ==" % EPS)
print("  lam    r_max=2: latency (g)     r_max=3: latency (r,g)     r_max=4: latency (r,g)    r_max=8: latency (r,g)    twin latency")
for lam in (0.5, 0.8, 0.9, 0.95):
    out = []
    for rm in (2, 3, 4, 8):
        b = best_design(P, lam, EPS, rm)
        out.append("%d (%d,%d)" % (b[0], b[1], b[2]) if b else "infeasible")
    print("  %.2f   %-22s %-26s %-24s %-24s %d" % ((lam,) + tuple(out) + (rt - 1,)))

print("\n== 4. Fixed deadline D: best residual of r copies spaced D/(r-1) (real) vs twin back-to-back p^r ==")
for lam in (0.8, 0.9):
    print("  lam = %.1f   D    r=2 (g=D)    r=3 (g=D/2)    r=4 (g=D/3)    consecutive r=D+1    twin r=D+1" % lam)
    for D in (3, 6, 12, 24, 48):
        v = [best_spacing_for_deadline(P, lam, D, r)[1] for r in (2, 3, 4)]
        print("              %-3d  %-12.3g %-14.3g %-14.3g %-19.3g %.3g" % (D, v[0], v[1], v[2], residual_real(P, lam, D + 1, 1), residual_twin(P, D + 1)))

print("\n== 5. Monte Carlo check of p q_g^(r-1) (200,000 chains per row, seed 7) ==")
rng = random.Random(7)
print("  lam   r  g    exact       Monte Carlo   |diff|/se")
for lam, r, g in ((0.8, 2, 1), (0.8, 3, 1), (0.8, 3, 4), (0.9, 2, 10)):
    ex = residual_real(P, lam, r, g)
    n = 200000
    mc = simulate(P, lam, r, g, n, rng)
    se = math.sqrt(ex * (1 - ex) / n)
    print("  %.1f   %d  %-3d  %.6f    %.6f      %.2f" % (lam, r, g, ex, mc, abs(mc - ex) / se))
