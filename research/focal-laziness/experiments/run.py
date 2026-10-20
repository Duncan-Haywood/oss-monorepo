"""Deterministic experiments; output in results.txt."""
from focal_laziness import *

p, G, k = 0.3, 1.0, 0.1
print(f"E1  payments (p={p}, G={G}): honest 2Gpq vs lazy 2Gd(1-d)")
for d in (0.5, 0.3, 0.1, 0.0):
    print(f"  d={d}: honest {honest_pay(p,G):.4f}  lazy {lazy_pay(p,d,G):.4f}  ratio {lazy_pay(p,d,G)/honest_pay(p,G):.3f}  a*={threshold(p,d,G,k):.3f}")

print("\nE2  Monte Carlo of the payment (400000 tasks)")
for ai, aj, d in ((1, 1, 0.5), (0, 0, 0.5), (0.5, 0.8, 0.4), (0.2, 0.3, 0.5)):
    print(f"  a=({ai},{aj}) d={d}: sim {simulate_pay(ai,aj,p,d,400000,3):.4f}  exact {pay(ai,aj,p,d):.4f}")

print("\nE3  best-response dynamics from a0 (d=0.5, k=0.1): basin boundary is a*")
ast = threshold(p, 0.5, G, k)
for a0 in (0.2, ast - 0.02, ast + 0.02, 0.6):
    print(f"  a0={a0:.3f} -> a_final {best_response_path(a0,p,0.5,G,k,400)[-1]:.3f}")

print("\nE4  gold-check payment mass g*R (fraction g of tasks, reward R for matching truth) making effort dominant")
for d in (0.5, 0.3, 0.1):
    for kk in (0.05, 0.1):
        g = gold_rate(p, d, G, kk)
        print(f"  d={d} k={kk}: g*R={g:.3f}  gain at a_j=0 with g*: {gold_effort_gain(0,p,d,G,kk,g):.2e}")
