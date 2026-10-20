"""Experiments for horizon-twin. Pure Python; output goes to results.txt (~1 s)."""
import math
from horizon_twin import *

A, B, Q, W = 0.9, 1.0, 1.0, 1.0
f = lambda x: "inf" if x == math.inf else f"{x:.3f}"

print("E1  real cost J(H) of the H-step gain designed in a twin with pole a_t = m*a  (a=0.9, b=1, q=1, r=1, PT=0)")
r = 1.0
print(f"    optimum J* = {opt_cost(A,B,Q,r,W):.4f}")
Hs = (1, 2, 3, 4, 6, 10, 60)
print("    m    " + " ".join(f"H={h:<5d}" for h in Hs) + "  twin claim at H=60")
for m in (0.5, 1.0, 1.5, 2.0, 3.0):
    ks = gains(m * A, B, Q, r, 60)
    print(f"    {m:<4} " + " ".join(f"{f(cost(ks[h-1],A,B,Q,r,W)):<7}" for h in Hs) + f"  {claim(ks[-1], m*A, B, Q, r, W):.3f}")

print("\nE2  best horizon H* on the real plant (shortest within 1e-9 of best, H<=60) vs the long horizon H=60")
print("    r     m    H*   J(H*)/J*  J(60)/J*  saving")
for r in (0.1, 1.0, 5.0, 20.0):
    Js = opt_cost(A, B, Q, r, W)
    for m in (0.5, 0.8, 1.2, 1.5, 2.0, 3.0):
        H, J, J60 = best_horizon(A, m * A, B, Q, r, 60, W=W)
        sv = "  n/a (H=60 unstable)" if J60 == math.inf else f"{max(0.0, 1-J/J60):8.1%}"
        print(f"    {r:<5} {m:<4} {H:<4d} {J/Js:8.4f}  {f(J60/Js) if J60<math.inf else 'inf':>8}  {sv}")

print("\nE3  the twin cannot see it: its own claim falls monotonically with H while the real cost does not (m=2, r=1)")
ks = gains(2 * A, B, Q, 1.0, 60)
print("    H     K_H     twin claim  real cost")
for h in (2, 3, 4, 6, 10, 60):
    print(f"    {h:<5d} {ks[h-1]:.4f}  {claim(ks[h-1],2*A,B,Q,1.0,W):9.4f}  {f(cost(ks[h-1],A,B,Q,1.0,W)):>9}")
print(f"    real optimal gain K* = {riccati_gain(A,B,Q,1.0):.4f}; twin's own K_inf = {riccati_gain(2*A,B,Q,1.0):.4f}")

print("\nE4  smallest unstable m = a_t/a (bisection on [1,1e4]); H=2 closed form (1+a)(r+b^2 q)/(a b q) in brackets")
for r in (0.1, 1.0, 5.0):
    e = {}
    for H in (2, 3, 60):
        e[H] = edge(lambda m: cost(gain(m * A, B, Q, r, H), A, B, Q, r) < math.inf, 1.0, 1e4)
    print(f"    r={r:<4} smallest unstable m: H=2 {e[2]:.3f} [{(1+A)*(r+B*B*Q)/(A*B*Q):.3f}]   H=3 {e[3]:.3f}   H=60 {e[60]:.3f}")

print("\nE5  terminal cost removes the effect: PT = twin's own P_inf makes the gain horizon-independent (m=2, r=1)")
at, r = 2 * A, 1.0
K = riccati_gain(at, B, Q, r)
Pinf = r * K / (at * B - B * B * K)
print(f"    P_inf = {Pinf:.4f}; gains H=1,2,5,20 with PT=P_inf: " + ", ".join(f"{gain(at,B,Q,r,h,Pinf):.4f}" for h in (1, 2, 5, 20)))
print(f"    real cost at that gain {cost(K,A,B,Q,r,W):.3f} vs H=2 gain with PT=0 {cost(gain(at,B,Q,r,2),A,B,Q,r,W):.3f} (J*={opt_cost(A,B,Q,r,W):.3f})")

print("\nE6  simulation check of the exact cost (400,000 steps, seed 1)")
for m, r, H in ((2.0, 1.0, 2), (2.0, 1.0, 60), (0.5, 1.0, 6)):
    K = gain(m * A, B, Q, r, H)
    Jx = cost(K, A, B, Q, r, W)
    Js = simulate_cost(K, A, B, Q, r, W, 400000, seed=1)
    print(f"    m={m} r={r} H={H}: exact {Jx:.4f}  simulated {Js:.4f}  ratio {Js/Jx:.4f}")
