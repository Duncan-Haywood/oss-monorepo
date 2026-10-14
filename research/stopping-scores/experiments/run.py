import math, random
from stopping_scores import *

a, c = 0.7, 0.01
lam = math.log(a / (1 - a))
print(f"setup: check accuracy a={a}, LLR per check {lam:.4f}, cost c={c} per check, prior 1/2\n")

print("E1 threshold rule: closed form vs simulation (a=0.7)")
rng = random.Random(1)
for k in (1, 2, 4, 6):
    res = [simulate(a, k, rng) for _ in range(40000)]
    print(f" k={k}  P(correct) sim {sum(r[0] for r in res)/len(res):.4f} exact {p_k(a,k):.4f}   E[checks] sim {sum(r[1] for r in res)/len(res):.3f} exact {expected_checks(a,k):.3f}")

print("\nE2 optimal stopping (dynamic programming over all policies) is the symmetric threshold; kappa = score scale")
print("  score   kappa   k*   delivered error 1-p_k   E[checks]   verifier utility   DP V(0)")
for name, G in (("Brier", G_brier), ("log", G_log)):
    for kappa in (0.1, 0.3, 1, 3, 10, 100):
        Gk = lambda p, G=G, kappa=kappa: G(p, kappa)
        k, u = best_threshold(Gk, a, c)
        V0 = dp_value(Gk, a, c, K=60)[0]
        print(f"  {name:<6} {kappa:<7} {k:<4} {1-p_k(a,k):.5f}                {expected_checks(a,k):7.2f}    {u:+.4f}            {V0:+.4f}")

print("\nE3 participation: smallest kappa at which the verifier checks at all = c/(G(a)-G(1/2))")
for aa in (0.55, 0.6, 0.7, 0.9):
    print(f"  a={aa:<5} Brier {participation_scale(G_brier, aa, c):9.3f}  (=4c/(2a-1)^2 {4*c/(2*aa-1)**2:9.3f})   log {participation_scale(G_log, aa, c):9.3f}")

print("\nE4 sequential vs commit-to-n (a=0.7): utility, and checks used at equal delivered accuracy")
print("  score  kappa  seq: k* util E[checks] err     fixed: n* util err      seq util gain   fixed n needed for seq's error")
def fixed_err(n):
    tot = 0.0
    for s in range(n + 1):
        w = 0.5 * math.comb(n, s) * (a ** s * (1 - a) ** (n - s) + (1 - a) ** s * a ** (n - s))
        x = abs(2 * s - n) * lam
        tot += w / (1 + math.exp(x))
    return tot
for name, G in (("Brier", G_brier), ("log", G_log)):
    for kappa in (1, 10, 100):
        Gk = lambda p, G=G, kappa=kappa: G(p, kappa)
        k, u = best_threshold(Gk, a, c)
        n, uf = best_fixed(Gk, a, c)
        e = 1 - p_k(a, k)
        m = next(m for m in range(1, 400) if fixed_err(m) <= e + 1e-12)
        print(f"  {name:<5} {kappa:<5} {k:<3} {u:+.4f} {expected_checks(a,k):6.2f} {e:.5f}    {n:<3} {uf:+.4f} {fixed_err(n):.5f}   {u-uf:+.4f}         {m} (vs {expected_checks(a,k):.2f})")

print("\nE5 Brier: large-kappa asymptote k* ~ ln(kappa (2a-1)^2 / ((1-a) c)) / lam  (a=0.7, c=1e-3)")
for kappa in (1e1, 1e2, 1e3, 1e4, 1e6, 1e9):
    k = best_threshold(lambda p: G_brier(p, kappa), a, 1e-3)[0]
    print(f"  kappa={kappa:<8.0e} k*={k:<3} prediction {math.log(kappa*(2*a-1)**2/((1-a)*1e-3))/lam:6.2f}   log-score k*={best_threshold(lambda p: G_log(p, kappa), a, 1e-3)[0]}")

print("\nE6 what does the principal buy?  score scale kappa needed for delivered error <= eps (a=0.7, c=0.01)")
for eps in (0.1, 0.03, 0.01, 0.001):
    row = []
    for name, G in (("Brier", G_brier), ("log", G_log)):
        lo, hi = 1e-3, 1e9
        for _ in range(200):
            mid = math.sqrt(lo * hi)
            k = best_threshold(lambda p: G(p, mid), a, c)[0]
            if 1 - p_k(a, k) <= eps: hi = mid
            else: lo = mid
        row.append(f"{name} kappa>={hi:10.3f}")
    print(f"  eps={eps:<6} " + "   ".join(row))
