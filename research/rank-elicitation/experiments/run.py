import random
from rank_elicitation import *

rng = random.Random(0)
def rsimplex(K):
    x = [rng.expovariate(1) for _ in range(K)]
    s = sum(x)
    return [a / s for a in x]

print("E1 K=5 equal weights: adjacent-swap regret (payment range 1) vs Brier-derived ranking (range 2, normalised to 1)")
K = 5
w = equal_weights(K)
print(" gap     linear rank   Brier/range   ratio(linear/Brier)   crossover gap 1/(K-1) = %.3f" % crossover_gap(K))
for d in (.3, .1, .03, .01, .001):
    lin = swap_regret(.2 + d, .2, w, 0)
    br = swap_regret_brier(.2 + d, .2) / 2
    print(f" {d:<7g} {lin:11.6f}   {br:11.6f}   {lin/br:12.2f}")

print("\nE2 min adjacent-swap incentive per unit range, K=6: equal spacing is optimal (1/(K-1))")
for name, w in (("equal", equal_weights(6)), ("geometric q=.8", geometric_weights(6, .8)),
                ("geometric q=.5", geometric_weights(6, .5)), ("top-2 set", topk_weights(6, 2))):
    print(f" {name:15s} min spacing {min(w[r]-w[r+1] for r in range(5)):.4f}   top-boundary spacing {w[0]-w[1]:.4f}")

print("\nE3 worst-case regret = reversed ranking (brute force over all 120 rankings, K=5, 200 random truths)")
worst = 0
for _ in range(200):
    p = rsimplex(5)
    for w in (equal_weights(5), geometric_weights(5, .5)):
        worst = max(worst, abs(max_rank_regret(p, w) - brute_max_regret(p, w)))
print(f" max |closed form - brute force| = {worst:.2e}")
print(" uniform-ish truth p=(.4,.3,.15,.1,.05), equal weights: max regret %.4f of range 1" % max_rank_regret([.4, .3, .15, .1, .05], equal_weights(5)))

print("\nE4 detecting one adjacent swap (p_i=.25,p_j=.15) with a one-sided z-test, z=1.645: n from formula vs simulation power")
pi, pj = .25, .15
for K in (3, 5, 9):
    dw = 1 / (K - 1)
    m, v = swap_diff_stats(pi, pj, dw)
    n = int(detection_n(m, v, 1.645) + .999)
    hits = 0
    for _ in range(2000):
        s = 0.0
        for _ in range(n):
            u = rng.random()
            s += dw if u < pi else (-dw if u < pi + pj else 0)
        hits += s / n / (v ** .5 / n ** .5) > 1.645
    mb, vb = swap_diff_stats_brier(pi, pj)
    print(f" K={K}: linear n={n}, sim power {hits/2000:.3f} (target ~0.5 at n=z^2 var/mean^2); Brier n={detection_n(mb, vb, 1.645):.1f} (same); expected payoff gain per task linear {m:.4f} vs Brier/range {mb/2:.4f}")
