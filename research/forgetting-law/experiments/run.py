import random
from forgetting_law import *

print("E1 forgetting curve, d=12 r=3 (|e0|=1): exact law vs 20000-run simulation")
rng = random.Random(1)
sim = simulate_forgetting(12, 3, 16, 20000, rng)
for k in (0, 1, 2, 3, 4, 6, 8, 12, 16):
    print(f" k={k:2d} law {forget(12,3,k):.5f}  sim {sim[k]:.5f}")
print(f" rho={rho(12,3):.4f} lam={lam(12,3):.4f} peak lag {peak_lag(12,3):.2f} peak {peak_forget(12,3):.5f} total {total_forget(12,3):.4f}")

print("\nE2 peak forgetting vs shape (d, r): lag, height, cumulative")
for d, r in [(8, 1), (8, 4), (32, 1), (32, 4), (32, 16), (128, 1), (128, 8), (128, 64), (512, 32)]:
    print(f" d={d:4d} r={r:3d} r/d={r/d:.3f} rho={rho(d,r):.4f} lam={lam(d,r):.4f} peak lag {peak_lag(d,r):6.2f} peak {peak_forget(d,r):.5f} total {total_forget(d,r):.4f}")

print("\nE3 modular routing, d=32 r=4: avg loss on seen tasks / fresh-task loss / sum, law vs simulation (1500 runs)")
rng = random.Random(5)
for T in (4, 12):
    for m in (1, 2, 4, 8):
        s, f = simulate_modular(32, 4, m, T, 1500, rng)
        print(f" T={T:2d} m={m}: seen law {avg_seen_loss(32,4,m,T):.5f} sim {s:.5f} | fresh law {fresh_mod(32,4,m,T):.5f} sim {f:.5f} | sum law {objective(32,4,m,T):.5f}")
print(" best module count minimising seen+fresh (d=32, r=4):", {T: best_modules(32, 4, T) for T in (1, 2, 3, 4, 6, 8, 12, 24, 48)})
print(" best module count (d=128, r=8):", {T: best_modules(128, 8, T) for T in (1, 2, 3, 4, 6, 8, 12, 24, 48, 96)})
print(" peak forgetting shared vs m=4 vs m=16 (d=32, r=4), max over k:")
for m in (1, 4, 16):
    print(f"  m={m}: {max(forget_mod(32,4,m,k) for k in range(400)):.5f}")

print("\nE4 conflicting tasks (task optima w*+delta_j, |delta|^2~tau2=1), shared model, d=10 r=2, 1500 runs")
rng = random.Random(9)
for steps in (1, 3, 10, 40):
    en, ls = simulate_conflict_floor(10, 2, 1.0, steps, 1500, rng)
    print(f" lag {steps:2d}: loss on old task {ls:.4f} (floor {conflict_floor(10,2,1.0):.4f}); stationary |e|^2 {en:.4f}")
