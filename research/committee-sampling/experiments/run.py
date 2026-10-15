import math
from committee_sampling import *

print("E1 exact majority-capture probability, pool N=100 with B=30 Byzantine (beta=0.3)")
print("  m    hypergeometric   binomial(with repl.)   Hoeffding bound")
for m in (5, 11, 21, 41, 61, 81, 99):
    t = m // 2 + 1
    print(f" {m:<4} {hyper_tail(100,30,m,t):.3e}      {binom_tail(m,0.3,t):.3e}           {hoeffding(m,0.3):.3e}")

print("\nE2 smallest odd committee for capture probability <= 2^-40 (N=10^6, with replacement is binomial)")
eps = 2 ** -40
print("  beta   exact m   ln(1/eps)/KL(1/2||beta)   exact/first-order   Hoeffding m")
for b in (0.05, 0.1, 0.2, 0.3, 0.4, 0.45):
    m = min_committee(10 ** 6, int(10 ** 6 * b), eps, replace=True)
    c = chernoff_size(b, eps)
    h = math.log(1 / eps) / (2 * (0.5 - b) ** 2)
    print(f" {b:<6} {m:<9} {c:<25.1f} {m/c:<19.3f} {h:.0f}")

print("\nE3 small pools: without replacement beats with replacement (target 1e-6)")
print("  N     B    m (hypergeometric)   m (binomial)")
for N, B in ((50, 10), (100, 20), (100, 30), (500, 150), (5000, 1500)):
    print(f" {N:<5} {B:<4} {min_committee(N,B,1e-6)!s:<20} {min_committee(N,B,1e-6,replace=True)}")

print("\nE4 stake weighting: adversary runs 20 of 100 nodes, each holding kappa x an honest node's stake; committee m=41")
print("  kappa  stake share   P(capture) by stake-weighted draws   P(capture) by uniform node draws (beta=0.2)")
for k in (1, 2, 4, 8, 16):
    s = stake_share(20, 80, k)
    print(f" {k:<6} {s:<13.3f} {binom_tail(41, s, 21):<36.3e} {hyper_tail(100,20,41,21):.3e}")

print("\nE5 safety vs liveness of a threshold-t rule, N=200, B=40 (beta=0.2), m=41")
print("  t    P(accept wrong)   P(cannot accept right)")
for t in (21, 25, 29, 33, 37):
    s, l = safety_liveness(200, 40, 41, t)
    print(f" {t:<4} {s:.3e}         {l:.3e}")
for w in (1, 100, 1e6):
    t, s, l = best_threshold(200, 40, 41, w)
    print(f" weight on liveness {w:g}: best t={t}  safety {s:.2e}  liveness {l:.2e}")

print("\nE6 adaptive corruption (Byzantine chosen after the draw): bribing a majority costs price*(m//2+1); committee-size trade-off")
print("  loss L=1e6, per-member cost 1, random Byzantine share 0.2: optimal m and cost")
for L in (1e3, 1e4, 1e6, 1e9):
    m, c = optimal_size(0.2, 1.0, L)
    print(f" L={L:<8.0e} m*={m:<4} total {c:<9.2f} capture prob {binom_tail(m,0.2,m//2+1):.2e}  bribe-a-majority cost at price 50: {adaptive_cost(m,50.0):.0f}")
