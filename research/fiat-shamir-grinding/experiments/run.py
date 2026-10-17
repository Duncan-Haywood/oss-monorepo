"""Deterministic experiments; output in results.txt. Seconds."""
import math
from fiat_shamir_grinding import *

print("E1  avoidance probability: exact vs with-replacement vs exp(-qk/T)   (T=1000, k=10)")
for q in (50, 100, 200, 400):
    print(f"  q={q:3d}  exact={p_avoid(1000,10,q):.5f}  repl={p_avoid_repl(1000,10,q):.5f}  exp={math.exp(-q*10/1000):.5f}  bits={bits(1000,10,q):.2f}")

print("\nE2  real SHA-256 grinding vs geometric law (seeded)")
for T, k, q in ((40, 2, 10), (100, 3, 20), (200, 4, 30)):
    p = p_avoid(T, k, q)
    mean, first = simulate_grind(T, k, q, trials=3000, seed=7)
    print(f"  T={T} k={k} q={q}  p={p:.4f}  first-try {first:.4f}  mean tries {mean:.2f} vs 1/p={1/p:.2f}")

print("\nE3  samples needed to deter (T=10^6, k=10^4 so T/k=100; G=gain, F=slash, c=cost per re-roll)")
T, k = 10**6, 10**4
qb = q_for_beacon(T, k, 1.0, 1.0)
print(f"  beacon after commitment, F=G:            q={qb}")
for L in (10, 20, 30, 40, 60):
    q = q_for_deterrence(T, k, 2.0 ** L, 1.0)
    print(f"  hash challenge, G/c=2^{L:<2d}:               q={q:6d}  = {q/qb:5.1f}x beacon   (ln(G/c)/lam_p = {L*math.log(2)/lam_p(T,k):.0f})")

print("\nE4  attacker profit vs q (T=1000, k=10, G=10^6, c=1): sign flips at q*")
T, k, G, c = 1000, 10, 1e6, 1.0
qs = q_for_deterrence(T, k, G, c)
for q in (0, 100, 500, qs - 1, qs, qs + 100):
    p = p_avoid(T, k, q)
    print(f"  q={q:4d}  p={p:.3e}  E[tries]={1/p:12.1f}  profit={grind_profit(G,c,p):12.1f}")

print("\nE5  budget-limited attacker (p=0.02, G=1000, c=1)")
for N in (1, 10, 50, 200, 1000):
    p = 0.02
    print(f"  N={N:4d}  P(escape)={1-(1-p)**N:.3f}  profit={grind_profit_budget(1000,1,p,N):8.2f}   (unbounded: {grind_profit(1000,1,p):.1f})")

print("\nE6  optimal proof-of-work on the challenge: x* = v/lam_p - c0   (T/k=100, G=2^40, c0=1, v=5)")
lp = lam_p(10**6, 10**4)
v, c0, G = 5.0, 1.0, 2.0 ** 40
xs = pow_cost_opt(v, lp, c0)
xb = overhead_best_bruteforce(v, lp, c0, G, xmax=4 * v / lp)
print(f"  lam_p={lp:.5f}  closed-form x*={xs:.2f}  brute-force x={xb:.2f}")
for x in (0.0, xs / 4, xs, 4 * xs):
    print(f"  PoW cost {x:8.1f}  q={math.log(G/(c0+x))/lp:8.1f}  total overhead {overhead(x,v,lp,c0,G):9.1f}")
print(f"  saving vs no PoW: {overhead(0,v,lp,c0,G)/overhead(xs,v,lp,c0,G):.2f}x")
