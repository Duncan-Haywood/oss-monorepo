import random
from ordinal_scores import *

K = 5
p = [.10, .20, .40, .20, .10]
print("E1 same Brier regret, different RPS regret: move eps=0.04 of mass off class 0 (K=5)")
for j in (1, 2, 3, 4):
    r = shift(p, 0, j, .04)
    print(f" 0->{j}: brier {brier_regret(r,p):.6f}  rps {rps_regret(r,p):.6f}  rps/brier {rps_regret(r,p)/brier_regret(r,p):.2f}")

print("\nE2 incentive per unit payment range for shift i->j (Brier range 2, RPS range K-1), K=5, eps^2 units")
for d in (1, 2, 3, 4):
    print(f" distance {d}: brier/range {2/2:.3f}  rps/range {d/(K-1):.3f}")

print("\nE3 exact worst-case regret at vertices vs range")
for name, q in (("symmetric", p), ("skewed low", [.6, .2, .1, .05, .05]), ("skewed high", [.05, .05, .1, .2, .6])):
    print(f" {name:12s} brier {max_regret_brier(q):.4f}/2  rps {max_regret_rps(q):.4f}/{K-1}")

print("\nE4 pooling two adjacent classes (equal split): regret rps = (d/2)^2, brier = d^2/2")
for i in range(K - 1):
    print(f" classes {i},{i+1}: rps {merge_regret_rps(p,i):.6f}  brier {merge_regret_brier(p,i):.6f}")

print("\nE5 threshold-error transfer: max_k |R_k-P_k| <= sqrt(rps regret) (random reports, K=5)")
rng = random.Random(0)
worst = 0
for _ in range(20000):
    x = [rng.expovariate(1) for _ in range(K)]
    r = [a / sum(x) for a in x]
    g = max(abs(a - b) for a, b in zip(cdf(r), cdf(p)))
    worst = max(worst, g / threshold_gap_bound(rps_regret(r, p)))
print(f" max ratio actual gap / bound = {worst:.4f} (<=1; equals 1 when one threshold carries the whole error)")
