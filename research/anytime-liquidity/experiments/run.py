"""Deterministic experiments; output in results.txt."""
import math
from anytime_liquidity import *

print("E1  bound constants (N=10): anytime sqrt-liquidity vs horizon-aware; ratio -> sqrt(2)")
N = 10
for T in (100, 1000, 10000, 100000):
    a, f = bound_anytime_opt(T, N), bound_fixed_opt(T, N)
    print(f"  T={T:6d}  fixed {f:8.2f}  anytime {a:8.2f}  ratio {a/f:.4f}   (sqrt2={math.sqrt(2):.4f})")

print("\nE2  adaptive adversary vs bound (N=8, T=2000): realised regret / bound")
N, T = 8, 2000
bf = b_fixed(T, N)
for name, bfun, bs in (("fixed b (T known)", lambda t: bf, [bf] * T),
                       ("b_t=c*sqrt(t)   ", lambda t: b_sqrt(t, N), [b_sqrt(t, N) for t in range(1, T + 1)])):
    ls = adversary_losses(T, N, bfun)
    r, _, _ = run(ls, bfun)
    print(f"  {name}  regret {r:7.2f}  bound {bound(bs, N):7.2f}  ratio {r/bound(bs, N):.3f}")

print("\nE3  doubling trick vs continuous anytime liquidity (N=8, adversary vs anytime b_t)")
for T in (1000, 4000, 16000):
    ls = adversary_losses(T, N, lambda t: b_sqrt(t, N))
    ra, _, _ = run(ls, lambda t: b_sqrt(t, N))
    rd = run_doubling(ls)
    print(f"  T={T:5d}  anytime {ra:7.2f}  doubling {rd:7.2f}  (doubling/anytime {rd/ra:.2f}; bound const {sqrt_sum_gap():.2f}x fixed)")

print("\nE4  self-tuning liquidity (AdaHedge) vs c*sqrt(t): regret, and final subsidy b_T ln N  (N=8, T=20000)")
N, T = 8, 20000
lnN = math.log(N)
for gap in (0.0, 0.05, 0.2, 0.6):
    ls = iid_losses(T, N, gap, seed=3)
    ra, _, _ = run(ls, lambda t: b_sqrt(t, N))
    rh, D, bT, _ = run_adahedge(ls)
    print(f"  gap={gap:4.2f}  sqrt-liq regret {ra:7.2f} subsidy {b_sqrt(T,N)*lnN:7.2f} | adaptive regret {rh:7.2f} Delta_T {D:7.2f} subsidy {bT*lnN:7.2f}  R<=2Delta: {rh<=2*D+1e-9}")
print("  adaptive vs adversary (N=8, T=5000, adversary reacts to adaptive prices):")
T = 5000
L = [0.0] * N; out = []; Delta = 0.0
# adversary reacting to adaptive market: rebuild step by step
bsched = []
Ls = [0.0] * N
for t in range(T):
    b = max(Delta / lnN, 1e-9) if Delta > 0 else 1e-9
    w = softmax_w(Ls, b)
    order = sorted(range(N), key=lambda i: -w[i])
    heavy = set(order[: N // 2])
    l = [1.0 if i in heavy else 0.0 for i in range(N)]
    h = sum(wi * li for wi, li in zip(w, l))
    m = -b * math.log(sum(wi * math.exp(-li / b) for wi, li in zip(w, l))) if Delta > 0 else min(l)
    Delta += max(0.0, h - m)
    out.append(l)
    for i in range(N): Ls[i] += l[i]
rh, D, bT, _ = run_adahedge(out)
print(f"  regret {rh:.2f}  sqrt(T lnN/2) = {bound_fixed_opt(T,N):.2f}  subsidy {bT*lnN:.2f}")
