"""Experiments for audit-allocation. Stdlib only; deterministic seeds."""
import random
from audit_allocation import *

print("== E1  cost of full deterrence: heterogeneous gains vs uniform audit vs Jensen bound (n=20, S=1) ==")
rng = random.Random(1); n = 20; S = 1.0
print("  spread   sum t_j   n*max t   n*t(mean g)")
for spread in (0.0, 0.5, 1.0, 1.5):
    import math
    gs = [math.exp(rng.gauss(0, spread)) for _ in range(n)]; gb = sum(gs) / n
    print(f"  {spread:.1f}     {full_cost(gs, S):7.3f}   {uniform_cost(gs, S):7.3f}   {n * threshold(gb, S):7.3f}")

print("\n== E2  optimal vs greedy vs uniform loss as budget grows (n=10 lognormal g, h; S=1; 200 instances, mean loss / total harm) ==")
print("  B/full   optimal   greedy   uniform")
rng = random.Random(2); insts = []
for _ in range(200):
    n = 10; gs = [math.exp(rng.gauss(0, 1)) for _ in range(n)]; hs = [math.exp(rng.gauss(0, 1)) for _ in range(n)]
    insts.append((hs, gs))
for f in (0.1, 0.25, 0.5, 0.75, 0.9, 1.0):
    o = gr = u = 0.0
    for hs, gs in insts:
        B = f * full_cost(gs, 1.0) + (1e-9 if f == 1.0 else 0); H = sum(hs)
        o += brute_force(hs, gs, 1.0, B)[0] / H; gr += greedy(hs, gs, 1.0, B)[0] / H; u += uniform_policy(hs, gs, 1.0, B) / H
    print(f"  {f:4.2f}     {o / 200:.4f}    {gr / 200:.4f}   {u / 200:.4f}")

print("\n== E3  greedy quality: worst harm-prevented ratio greedy/optimal over random instances (n<=9) ==")
rng = random.Random(3); worst = 1.0; cnt = 0; below99 = 0
for _ in range(3000):
    n = rng.randint(2, 9); gs = [math.exp(rng.gauss(0, 1.2)) for _ in range(n)]; hs = [math.exp(rng.gauss(0, 1.2)) for _ in range(n)]
    S = rng.uniform(0.3, 3); B = rng.uniform(0.1, 0.9) * full_cost(gs, S)
    o = sum(hs) - brute_force(hs, gs, S, B)[0]; g = sum(hs) - greedy(hs, gs, S, B)[0]
    if o > 1e-9:
        r = g / o; worst = min(worst, r); cnt += 1; below99 += r < 0.99
print(f"  instances {cnt}, worst ratio {worst:.4f}, share with ratio<0.99: {below99 / cnt:.4f}")
# density-only greedy fails when B < t_j (partial spending at slope h_j wins); the 1/3 guarantee needs the partial-only candidate
hs = [4.017, 2.903, 0.091, 0.071]; gs = [0.698, 0.357, 0.217, 0.652]; gs = [t / (1 - t) * 1.0211 for t in (0.411, 0.263, 0.178, 0.395)]
print(f"  4-job instance: optimal loss {brute_force(hs, gs, 1.0211, 0.2488)[0]:.4f}, greedy loss {greedy(hs, gs, 1.0211, 0.2488)[0]:.4f} (density-only greedy: 6.7058)")

print("\n== E4  stake substitutes for audits: least stake so that budget B deters everything (n=20, g lognormal, seed 4) ==")
rng = random.Random(4); gs = [math.exp(rng.gauss(0, 1)) for _ in range(20)]
print("  B   S*(B)   identical-g closed form g(n/B-1) at g=mean")
gb = sum(gs) / 20
for B in (1, 2, 4, 8):
    print(f"  {B}   {min_stake_for_budget(gs, B):7.3f}   {gb * (20 / B - 1):7.3f}")

print("\n== E5  loss formula vs Monte Carlo with a best-responding cheater (100k rounds) ==")
hs = [1.0, 2.0, 0.5, 1.5]; gs = [1.0, 2.0, 4.0, 0.5]; S = 2.0
for ps in ([0.1, 0.1, 0.1, 0.1], [0.3, 0.5, 0.0, 0.2], [0.34, 0.5, 0.3, 0.2]):
    print(f"  p={ps}  formula {total_loss(ps, hs, gs, S):.4f}  MC {simulate_loss(ps, hs, gs, S, 100000, seed=5):.4f}")
