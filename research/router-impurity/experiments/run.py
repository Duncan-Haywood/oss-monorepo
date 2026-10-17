import random
from router_impurity import *

d, r, tw, tb, K = 12, 3, 0.2, 1.0, 4
u = [1 / K] * K
print(f"E1 floor law vs simulation, d={d} r={r} tau_w^2={tw} tau_b^2={tb} K={K} (3000 runs each)")
cases = [("one shared module", random_router(K, 1)), ("4 modules, random routing", random_router(K, 4)),
         ("2 modules, block router", block_router(K, 2)), ("4 modules, router error q=0.1", noisy_router(K, .1)),
         ("4 modules, router error q=0.3", noisy_router(K, .3)), ("4 modules, perfect router", noisy_router(K, 0))]
for name, R in cases:
    sim = simulate_floor(d, r, tw, tb, u, R, 3000, random.Random(11))
    ex = floor(d, r, tw, tb, u, R)
    print(f" {name:32s} purity {purity(u, R):.3f} law {ex:.4f} sim {sim:.4f} ({100*(sim-ex)/ex:+.1f}%)")

print("\nE2 non-uniform prior and asymmetric router (K=3), d=8 r=2 tau_w^2=0.3 tau_b^2=1 (3000 runs)")
u3 = [0.6, 0.3, 0.1]
R3 = [[0.9, 0.1], [0.2, 0.8], [0.0, 1.0]]
for name, R in [("shared", random_router(3, 1)), ("2 modules, asymmetric", R3)]:
    sim = simulate_floor(8, 2, 0.3, 1.0, u3, R, 3000, random.Random(5))
    ex = floor(8, 2, 0.3, 1.0, u3, R)
    print(f" {name:24s} purity {purity(u3, R):.3f} law {ex:.4f} sim {sim:.4f} ({100*(sim-ex)/ex:+.1f}%)")

print("\nE3 what modules buy, K=8 uniform clusters, tau_w^2=0.2 tau_b^2=1, d=32 r=4: floor by modules m")
K = 8
u = [1 / K] * K
print("  m  blockrouter floor  removed  |  random-routing floor")
for m in (1, 2, 3, 4, 6, 8):
    print(f" {m:2d}  {floor(32,4,.2,1.,u,block_router(K,m)):.4f}            {100*removed_fraction(u,block_router(K,m)):5.1f}%   |  {floor(32,4,.2,1.,u,random_router(K,m)):.4f}")
print(f" modules needed to remove 50% / 90% of between-cluster floor: {modules_for_target(K,.5)} / {modules_for_target(K,.9)}")

print("\nE4 router error is expensive at first order: floor increase per unit q (K=8)")
for q in (0.0, 0.02, 0.05, 0.1, 0.25, 0.5, 7 / 8):
    imp = impurity(u, noisy_router(K, q))
    print(f" q={q:.3f} impurity {imp:.4f} (first-order 2q = {2*q:.4f}) floor {floor(32,4,.2,1.,u,noisy_router(K,q)):.4f}  share of ceiling {100*(0.2+imp)/(0.2+1-1/K):5.1f}%")

print("\nE5 auditing purity from labelled tasks: unbiased pair-collision estimator, module with pi=(0.8,0.1,0.1) (true 0.660)")
rng = random.Random(3)
pi = [0.8, 0.1, 0.1]
for n in (5, 10, 30, 100, 300):
    ests = []
    for _ in range(4000):
        cnt = [0, 0, 0]
        for _ in range(n):
            cnt[rng.choices(range(3), weights=pi)[0]] += 1
        ests.append(purity_from_counts(cnt))
    m = sum(ests) / len(ests)
    sd = (sum((x - m) ** 2 for x in ests) / len(ests)) ** .5
    print(f" n={n:4d} mean {m:.4f} sd {sd:.4f}")
