"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from occlusion_twin.model import (p_clear, p_pair_clear, p_blind_exact, p_blind_indep, beams, var_clear_count, var_clear_count_indep,
                                  sample_blocked, beams_needed)

RHO = 0.5            # occluder radius (m); diameter 1 m
P1 = 0.5             # single-beam clear probability
MU = -math.log(P1) / (2 * RHO)

print("Occlusion twin: Poisson occluders, radius %g m, single-beam clear probability %g (mu = %.4f centres/m of lateral extent)" % (RHO, P1, MU))

print("\n== 1. Two beams: P(both blocked), exact vs independent-beam twin (1-p)^2 = %.4f ==" % ((1 - P1) ** 2))
print("  spacing s(m)  exact    twin     exact/twin   P(both clear) exact  twin p^2")
for s in (0.0, 0.1, 0.25, 0.5, 0.75, 1.0, 1.5):
    ex = p_blind_exact([0.0, s], RHO, MU)
    tw = (1 - P1) ** 2
    print("  %5.2f         %.4f   %.4f   %6.3f       %.4f               %.4f" % (s, ex, tw, ex / tw, p_pair_clear(s, RHO, MU), P1 * P1))

print("\n== 2. Eight beams: P(sensor blind) vs spacing ==")
print("  s(m)   exact       twin        exact/twin   Var(#clear) exact   twin   (mean #clear = %.1f in both)" % (8 * P1))
for s in (0.05, 0.1, 0.25, 0.5, 0.75, 1.0, 2.0):
    ys = beams(8, s)
    ex = p_blind_exact(ys, RHO, MU)
    tw = p_blind_indep(8, RHO, MU)
    print("  %4.2f   %.6f    %.6f    %8.2f     %6.3f              %6.3f" % (s, ex, tw, ex / tw, var_clear_count(ys, RHO, MU), var_clear_count_indep(8, RHO, MU)))

print("\n== 3. Beams needed for P(blind) <= eps (cap 16; '>16' = not reachable) ==")
print("  eps     spacing: " + "  ".join("%5.2f" % s for s in (0.1, 0.25, 0.5, 0.75, 1.0)) + "   twin")
for eps in (0.1, 0.05, 0.01, 0.001):
    row = []
    for s in (0.1, 0.25, 0.5, 0.75, 1.0):
        n = beams_needed(eps, s, RHO, MU, exact=True)
        row.append("%5s" % (n if n else ">16"))
    nt = beams_needed(eps, 1.0, RHO, MU, exact=False, nmax=40)
    print("  %-6g          %s   %s" % (eps, "  ".join(row), nt))

print("\n== 4. Ensemble twin (sample occluder field) vs exact, 8 beams at 0.25 m, 200000 fields ==")
rng = random.Random(0)
N = 200000
ys = beams(8, 0.25)
blind = sum(all(sample_blocked(ys, RHO, MU, rng)) for _ in range(N)) / N
ex = p_blind_exact(ys, RHO, MU)
print("  exact %.5f   ensemble %.5f (+-%.5f)   independent twin %.5f" % (ex, blind, math.sqrt(ex * (1 - ex) / N), p_blind_indep(8, RHO, MU)))

print("\n== 5. Same single-beam statistics, different occluder size: 8 beams at 0.25 m, p = %g ==" % P1)
print("  rho(m)  exact blind   twin")
for rho in (0.05, 0.125, 0.25, 0.5, 1.0):
    mu = -math.log(P1) / (2 * rho)
    print("  %5.3f   %.6f      %.6f" % (rho, p_blind_exact(beams(8, 0.25), rho, mu), p_blind_indep(8, rho, mu)))
