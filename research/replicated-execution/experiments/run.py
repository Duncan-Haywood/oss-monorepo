"""Experiments for replicated-execution. Stdlib only; deterministic seeds."""
import math
from replicated_execution import *

G = 1.0

print("== E1  minimum stake for unique honesty, S = G b^(k-1)/(1-b^(k-1))  (units of gain G) ==")
print("  beta   k=2     k=3     k=4     k=6     k=8")
for b in (0.1, 0.2, 0.3, 0.5, 0.7):
    print(f"  {b:.1f} " + " ".join(f"{min_stake(b ** (k - 1), G):7.4f}" for k in (2, 3, 4, 6, 8)))

print("\n== E2  formula vs Monte Carlo: focal colluder's cheat payoff (n=30, m=12, S=2G, 200k trials) ==")
n, m = 30, 12
for k in (2, 3, 4):
    p = p_others(n, m, k)
    for pi in (0.5, 1.0):
        mc = simulate_focal(n, m, k, pi, G, 2.0, 200000, seed=k)
        print(f"  k={k} pi={pi:.1f}  p={p:.4f}  formula {cheat_payoff(p, pi, k, G, 2.0):+.4f}  MC {mc:+.4f}")

print("\n== E3  coordination: basin of cheating for stake below the unique-honesty threshold (beta=0.5, k=3) ==")
b, k = 0.5, 3; p = b ** (k - 1); Sfull = min_stake(p, G)
print(f"  unique-honesty stake = {Sfull:.4f}")
for frac in (0.25, 0.5, 0.75, 0.9, 1.0):
    S = frac * Sfull; ps = pi_star(p, k, G, S)
    if ps is None:
        print(f"  S={frac:.2f}*S_full  pi*=none (cheating never pays)"); continue
    ends = [replicator(p, k, G, S, pi0) for pi0 in (max(0.0, ps - 0.05), min(1.0, ps + 0.05))]
    print(f"  S={frac:.2f}*S_full  pi*={ps:.3f}  basin of cheating={1 - ps:.3f}  replicator from pi*-.05 -> {ends[0]:.3f}, from pi*+.05 -> {ends[1]:.3f}")
print("  stake for basin eps (beta=0.5, k=3): " + ", ".join(f"eps={e}: {min_stake_basin(p, k, G, e):.4f}" for e in (0.5, 0.2, 0.05, 0.01)))

print("\n== E4  secret vs public assignment: corrupted-job fraction (n=100, m=30 => beta=0.3), 400k jobs ==")
print("  k   secret+stake>=S_full   public (any stake)   exact C(m,k)/C(n,k)   MC public")
for k in (2, 3, 4, 5):
    ex = math.comb(30, k) / math.comb(100, k)
    bad, _ = simulate_corruption(100, 30, k, 400000, "informed", lam=1.0, seed=k)
    print(f"  {k}   {0.0:8.5f}               {ex:9.5f}            {ex:9.5f}             {bad:9.5f}")

print("\n== E5  leakage floor: coalition learns the assignment w.p. lambda (beta=0.3, k=3, stake >= S_full) ==")
print("  lambda   floor lam*C(m,k)/C(n,k)   MC")
ex = math.comb(30, 3) / math.comb(100, 3)
for lam in (0.0, 0.1, 0.5, 1.0):
    bad, _ = simulate_corruption(100, 30, 3, 400000, "informed", lam=lam, seed=11)
    print(f"  {lam:.1f}      {lam * ex:.5f}                {bad:.5f}")
print("  replication needed so the floor stays <= 1e-4 per job at beta=0.3:")
for lam in (1.0, 0.1, 0.01):
    k = 1
    while lam * 0.3 ** k > 1e-4: k += 1
    print(f"    lambda={lam}: k={k}")

print("\n== E6  cost-optimal replication under secret assignment: min k*c + r*S(k), c=1, G=10 ==")
print("  beta   r     k*   per-job cost   stake S(k*)")
for b in (0.1, 0.3, 0.5, 0.7):
    for r in (0.1, 1.0):
        k, cost, S = optimal_k(b, 10.0, 1.0, r)
        print(f"  {b:.1f}  {r:4.1f}  {k:3d}   {cost:9.3f}   {S:9.4f}")
