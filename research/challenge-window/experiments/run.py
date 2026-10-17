"""Deterministic experiments; output in results.txt."""
import math, random
from challenge_window import *

print("E1  closed form vs exact recursion (5000 random instances)")
rng = random.Random(0)
bad = 0
for _ in range(5000):
    G = rng.uniform(1, 500); S = rng.uniform(1, 500); rho = rng.uniform(0.01, 0.95); b = rng.uniform(0.1, 300)
    bad += window_closed(G, S, rho, b) != window_dp(G, S, rho, b)
print(f"  mismatches: {bad}")

print("\nE2  Monte Carlo of the optimal policy vs recursion value (G=60,S=25,rho=.25,b=6)")
for w in (3, 6, 9, 12):
    m, se = simulate_policy(w, 60, 25, 0.25, 6, 200000, seed=w)
    print(f"  w={w:2d}  V={value(w,60,25,0.25,6):8.3f}  MC={m:8.3f} +- {se:.3f}")

print("\nE3  deterrence window vs stake (G=100, rho=.2, exogenous bribe price b=2)")
print("   S   luck-only  bribe-only  exact")
for S in (10, 25, 50, 100, 200, 400, 1600):
    print(f"  {S:5d}  {window_luck(100,S,.2):8d}  {window_bribe(100,.2,2):9d}  {window_dp(100,S,.2,2):6d}")

print("\nE4  bounty-funded priority fee: b = theta*S, theta=0.5 (G=100, rho=.2); S*w should be ~ G/((1-rho)theta)=250")
print("   S   window   S*w")
for S in (10, 25, 50, 100, 200, 400):
    w = window_dp(100, S, .2, .5 * S)
    print(f"  {S:5d}  {w:6d}  {S*w:7.0f}")

print("\nE5  ignoring bribes (luck-only window) vs exact, G=S=100, b=1")
print("  rho   luck  exact  underestimate")
for rho in (0.05, 0.1, 0.2, 0.4, 0.6):
    l, e = window_luck(100, 100, rho), window_dp(100, 100, rho, 1)
    print(f"  {rho:4.2f}  {l:4d}  {e:5d}  x{e/max(l,1):.1f}")

print("\nE6  adaptive gamble-then-bribe vs non-adaptive prefix plan: attacker value at w (G=100,S=50,rho=.6,b=80)")
for w in (1, 2, 3, 4, 5, 6, 8):
    v, p = value(w, 100, 50, .6, 80), prefix_value(w, 100, 50, .6, 80)
    print(f"  w={w:2d}  adaptive {v:8.2f}   prefix {p:8.2f}")
print(f"  deterrence window: adaptive {window_dp(100,50,.6,80)}; prefix plan would say "
      f"{next(w for w in range(500) if prefix_value(w,100,50,.6,80)<=1e-9)}")

print("\nE7  stake needed for a 10-block window (G=100, rho=.2)")
for name, fn in (("exogenous b=2", lambda s: 2.0), ("fee-funded b=S/2", lambda s: .5 * s), ("fee-funded b=S", lambda s: s)):
    print(f"  {name:18s} S* = {stake_for_window(10,100,.2,fn):9.1f}")
