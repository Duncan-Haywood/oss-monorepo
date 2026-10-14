import math, random
from race_heterogeneity import *
from race_heterogeneity.model import _others

print("E1 exact win probability vs simulation, rates (2,1,1,0.5), k=2, 60000 races, seed 5")
rng = random.Random(5); rates = [2.0, 1.0, 1.0, 0.5]
paid, tk = simulate(rates, 2, rng, 60000)
print("  exact ", " ".join(f"{win_prob(rates[i], rates[:i]+rates[i+1:], 2, 3000):.4f}" for i in range(4)))
print("  sim   ", " ".join(f"{q:.4f}" for q in paid), f"  E X_(2): exact {expected_kth(rates,2):.4f} sim {tk:.4f}")

print("E2 two types, n=8 (4 fast c=1, 4 slow c=ratio), R=1: equilibrium rates, pay shares, round time (homogeneous c=1: T=nc/((n-k)R))")
counts = [4, 4]
for k in (1, 2, 4, 6):
    print(f"  k={k}  homogeneous T={8/((8-k)):.3f}")
    for ratio in (1.0, 1.5, 2.0, 4.0, 8.0):
        costs = [1.0, ratio]
        m = solve(counts, costs, k)
        pf = win_prob(m[0], _others(counts, m, 0), k); ps = win_prob(m[1], _others(counts, m, 1), k)
        T = expected_kth([m[0]] * 4 + [m[1]] * 4, k)
        g = max(best_response_gain(counts, costs, m, k, t) for t in (0, 1))
        print(f"    ratio {ratio:3.1f}: rates fast {m[0]:.4f} slow {m[1]:.4f} (x{m[0]/m[1]:.2f})  P(paid) fast {pf:.3f} slow {ps:.3f}  share of prizes to slow {4*ps/k:.3f}  T={T:.3f}  max deviation gain {g:.4f}")

print("E3 does more winners cut discouragement? slow/fast rate ratio and slow share, n=8 (4+4), cost ratio 4, R=1")
for k in (1, 2, 3, 4, 5, 6, 7):
    m = solve(counts, [1.0, 4.0], k)
    ps = win_prob(m[1], _others(counts, m, 1), k)
    print(f"  k={k}  slow/fast rate {m[1]/m[0]:.3f}  slow share of prizes {4*ps/k:.3f} (fair share 0.5)  P(paid) slow {ps:.3f} (k/n={k/8:.3f})")

print("E4 one strong entrant among 7 weak (costs 0.25 vs 1), n=8, R=1")
for k in (1, 2, 4):
    m = solve([1, 7], [0.25, 1.0], k)
    ps = win_prob(m[0], _others([1, 7], m, 0), k)
    T = expected_kth([m[0]] + [m[1]] * 7, k)
    print(f"  k={k}  strong rate {m[0]:.4f} weak rate {m[1]:.4f}  P(strong paid) {ps:.3f}  T={T:.3f}  vs homogeneous c=1: {8/(8-k):.3f}")

print("E5 convex cost c x^p, symmetric closed form x*=(R e/(p c))^(1/p): round time and best k under budget B=kR (n=32, c=1, B=10)")
for p in (1.0, 1.5, 2.0, 3.0):
    ts = [(sym_round_time(32, k, 10.0 / k, 1.0, p), k) for k in range(1, 32)]
    t, kb = min(ts)
    print(f"  p={p}: T(k=1)={ts[0][0]:.4f}  T(k=8)={ts[7][0]:.4f}  T(k=16)={ts[15][0]:.4f}  best k={kb} T={t:.4f}")
print("  convex cost, fixed prize R=1, k=4: round time as n grows (linear p=1 limit c/R)")
for p in (1.0, 2.0):
    print(f"  p={p}: " + "  ".join(f"n={n}: {sym_round_time(n,4,1.0,1.0,p):.3f}" for n in (5, 8, 32, 128, 1024)))

print("E6 exit threshold: slow workers stay out iff c_s/c_f >= n_f/(n_f-k) (n_f=4 fast). Best entry payoff of one slow worker vs the fast-only equilibrium")
for k in (1, 2, 3):
    th = exit_ratio(4, k)
    row = []
    for f in (0.9, 1.0, 1.1):
        best = max(entry_payoff(0.001 * i, 4, k, 1.0, f * th) for i in range(1, 400))
        row.append(f"ratio {f*th:.3f}: {best:+.5f}")
    print(f"  k={k} threshold {th:.3f}   " + "   ".join(row))
print("  k=4 (= n_f): threshold infinite, slow workers always enter (E2: slow rate > 0 at every ratio)")

print("E7 empirical mean-cost law T = n * mean(c)/((n-k)R) with 4 fast + 4 slow (c=1, r), all active (k>=4); deviation grows with the ratio")
for k in (4, 5, 6):
    out = []
    for r in (1.5, 2.0, 4.0, 8.0):
        m = solve([4, 4], [1.0, r], k, steps=1500, iters=600, damp=0.7, tol=1e-12)
        T = expected_kth([m[0]] * 4 + [m[1]] * 4, k, 8000)
        b = mean_cost_time(8, k, 1.0, [1.0] * 4 + [r] * 4)
        out.append(f"r={r:g}: T={T:.4f} law {b:.4f} ({100*(T/b-1):+.2f}%)")
    print(f"  k={k}  " + "   ".join(out))
