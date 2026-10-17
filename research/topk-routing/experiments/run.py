import math, random
from topk_routing import *

n, T = 32, 2000

print("E1 regret vs bound k ln(N/k)/eta + eta T k/2 (N=32, T=2000, tuned eta), three streams, seed 1")
r = random.Random(1)
for k in (1, 4, 8, 16):
    eta = tuned_eta(n, k, T)
    row = []
    for name, s in (("bern", bernoulli_stream([.3 + .01 * i for i in range(n)], T, r)),
                    ("chase", leader_chasing_stream(n, k, T, r)),
                    ("switch", switching_stream(n, k, T, 250, r))):
        tot, L, _ = hedge_topk(s, k, eta)
        row.append(f"{name} {tot - best_k_loss(L, k):8.1f}")
    print(f"  k={k:2d} bound {regret_bound(n,k,T,eta):8.1f}  " + "  ".join(row))

print("E2 the cost of choosing k distinct experts: switching stream, regret vs best fixed k-set / bound")
r = random.Random(2)
for k in (1, 2, 4, 8, 16, 24, 31):
    eta = tuned_eta(n, k, T); s = switching_stream(n, k, T, 250, r)
    tot, L, _ = hedge_topk(s, k, eta)
    print(f"  k={k:2d} ln(N/k)={math.log(n/k):.2f}  regret {tot-best_k_loss(L,k):7.1f}  fraction of bound {(tot-best_k_loss(L,k))/regret_bound(n,k,T,eta):5.2f}")

print("E3 cap vs plain normalisation to sum k: one expert with loss 0.1, rest 0.5+noise, k=4, N=32, eta=0.3")
r = random.Random(3)
s = [[0.1] + [0.5 + 0.1 * r.random() for _ in range(n - 1)] for _ in range(300)]
for cap in (True, False):
    tot, L, pl = hedge_topk(s, 4, 0.3, cap=cap)
    bad = sum(1 for lam, m in pl if m > 0)
    print(f"  cap={cap!s:5}  total loss {tot:7.2f}  rounds with an expert priced above 1: {bad if not cap else 0}/{len(pl)}  saturated in last round: {pl[-1][1]}")
tot_c = hedge_topk(s, 4, 0.3, cap=True)[0]; tot_u = hedge_topk(s, 4, 0.3, cap=False)[0]
print(f"  uncapped 'plays' over-count the good expert: implied loss {tot_u:.2f} is infeasible (< capped {tot_c:.2f})")

print("E4 rounding to k distinct experts: systematic vs independent Bernoulli variance of realised loss (30000 draws)")
r = random.Random(4)
for name, sp in (("sorted losses", True), ("interleaved", False)):
    w = [math.exp(-0.5 * i) for i in range(n)]
    p, lam, m = cap_project(w, 8)
    l = [i / (n - 1) for i in range(n)]
    if not sp:
        l = [l[(i * 7) % n] for i in range(n)]
    print(f"  {name:13s} Poisson var {poisson_var(p,l):.4f}  systematic var {systematic_var_sim(p,l,30000,r):.4f}  E loss {sum(a*b for a,b in zip(p,l)):.3f}")

print("E5 shadow price and saturation on a Bernoulli stream (k=4, tuned eta, seed 5)")
r = random.Random(5)
s = bernoulli_stream([.2] * 4 + [.5] * 28, T, r); eta = tuned_eta(n, 4, T)
_, _, pl = hedge_topk(s, 4, eta)
for t in (0, 10, 100, 500, 1999):
    print(f"  t={t:4d}  lam={pl[t][0]:10.3f}  saturated experts {pl[t][1]}")
