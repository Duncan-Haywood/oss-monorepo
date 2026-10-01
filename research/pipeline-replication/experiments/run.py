"""Deterministic experiments; output in results.txt."""
from pipeline_replication import *

L, a = 48, 0.9
print(f"E1  replicas needed for drop rate <= 1e-3 (L={L}, worker availability a={a}); exact vs Poisson-tail approx")
for s in (0, 1, 2, 4, 8):
    r = min_replicas(L, a, s, 1e-3)
    print(f"  skip budget s={s}: r = {r}  approx {r_approx(L, a, s, 1e-3):.2f}  workers {L*r}")

print("\nE2  correlated outages: replicas cannot beat the domain floor (L=48, a=0.9, target drop <= 1e-2)")
for rho in (0.0, 0.0001, 0.001, 0.005, 0.01):
    row = []
    for s in (0, 1, 2, 3):
        r = min_replicas(L, a, s, 1e-2, rho)
        row.append("infeasible" if r is None else f"r={r}")
    print(f"  rho={rho:<7} floor(s=0) success {floor_success(L, rho, 0):.4f}   " + "   ".join(f"s={s}: {x}" for s, x in zip((0, 1, 2, 3), row)))

print("\nE3  cost-optimal (r, s): workers per unit useful throughput (a=0.9)")
for Lx in (16, 48, 128):
    for kappa in (0.02, 0.1, 0.4):
        c, r, s = best_design(Lx, a, kappa, smax=24)
        c0 = min(cost_per_yield(Lx, a, rr, 0, kappa) for rr in range(1, 40))
        print(f"  L={Lx:3d} kappa={kappa:4.2f}: best r={r} s={s} cost {c:7.1f}   no-skip best {c0:7.1f}   ratio {c0/c:.3f}")

print("\nE4  Monte Carlo check (L=20, r=2, a=0.8, rho=0.01, 40000 trials)")
for s in (0, 1, 2, 4):
    p, d = simulate(20, 0.8, 2, s, 0.01, 40000, seed=5)
    ex = p_ok(20, stage_dead(0.8, 2, 0.01), s)
    print(f"  s={s}: success sim {p:.4f} exact {ex:.4f}   mean skips|ok {d:.3f}")
