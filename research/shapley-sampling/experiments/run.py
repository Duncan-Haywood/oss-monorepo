import math, random
from shapley_sampling import *

def games():
    rng = random.Random(0)
    return {"equal n=8": [0.4] * 8,
            "spread n=8": [0.05, 0.1, 0.2, 0.4, 0.6, 0.9, 1.4, 2.0],
            "one whale n=8": [0.1] * 7 + [3.0],
            "dust n=10": [0.02] * 9 + [1.0]}

print("E1 exact per-player sampling std (m=100 marginal evals/player): permutation vs size-stratified, and ratio of variances")
for name, w in games().items():
    phi = exact_shapley(w)
    m = 100 - 100 % len(w)
    pv = [perm_var(w, i, phi[i]) / m for i in range(len(w))]
    sv = [strat_var(w, i, m) for i in range(len(w))]
    print(f" {name:14s} total phi={sum(phi):.4f} rmse perm={math.sqrt(sum(pv)/len(w)):.5f} strat={math.sqrt(sum(sv)/len(w)):.5f} var ratio perm/strat={'inf (strat exact)' if sum(sv)<1e-20 else format(sum(pv)/sum(sv),'.2f')}")

print("\nE2 simulation vs exact-variance prediction (spread n=8, m=96, 600 runs)")
w = games()["spread n=8"]; phi = exact_shapley(w); m = 96
for label, f, pred in [("perm", sample_perm, lambda: math.sqrt(sum(perm_var(w,i,phi[i])/m for i in range(8))/8)),
                       ("strat", sample_strat, lambda: math.sqrt(sum(strat_var(w,i,m) for i in range(8))/8))]:
    rng = random.Random(5)
    r = math.sqrt(sum(rmse(f(w, m, rng), phi) ** 2 for _ in range(600)) / 600)
    print(f" {label:6s} simulated rmse {r:.5f} predicted {pred():.5f} ratio {r/pred():.3f}")
rng = random.Random(6)
r = math.sqrt(sum(rmse(sample_perm_antithetic(w, m, rng), phi) ** 2 for _ in range(600)) / 600)
print(f" antithetic (reverse) permutations rmse {r:.5f}")

print("\nE3 efficiency: sum of estimated payments minus v(N) (spread n=8, m=96, 300 runs)")
vN = value(w, range(8))
for label, f in [("perm", sample_perm), ("antithetic", sample_perm_antithetic), ("strat", sample_strat)]:
    rng = random.Random(7)
    gaps = [sum(f(w, m, rng)) - vN for _ in range(300)]
    print(f" {label:10s} mean gap {sum(gaps)/300:+.5f}  max |gap| {max(abs(g) for g in gaps):.5f}  (v(N)={vN:.4f})")

print("\nE4 Hoeffding permutations for max-error eps at delta=0.05 vs permutations actually needed (spread n=8; 95th pct of max error <= eps)")
for eps in (0.05, 0.02, 0.01):
    hb = hoeffding_samples(8, eps, .05)
    need = None
    for m2 in [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]:
        rng = random.Random(8)
        errs = sorted(max(abs(a - b) for a, b in zip(sample_perm(w, m2, rng), phi)) for _ in range(200))
        if errs[189] <= eps:
            need = m2; break
    print(f" eps={eps}: Hoeffding {hb}  empirical (power-of-2 grid) {need}  looseness {hb/need:.0f}x")

print("\nE5 rank recovery: probability the top-3 payees by estimate are the exact top-3 (spread n=8)")
top = sorted(range(8), key=lambda i: -phi[i])[:3]
for m2 in (8, 32, 128, 512):
    for label, f in [("perm", sample_perm), ("strat", sample_strat)]:
        rng = random.Random(9)
        ok = 0
        for _ in range(300):
            e = f(w, m2 - m2 % 8, rng)
            ok += sorted(sorted(range(8), key=lambda i: -e[i])[:3]) == sorted(top)
        print(f" m={m2:4d} {label:6s} {ok/300:.2f}", end="")
    print()
