"""Seeded/deterministic experiments; output in results.txt. ~1-2 min."""
import math
from contest_precision import *

print("E1  a_n = slope of win probability (units of sigma); effort e* = V a_n / sigma")
for n in (2, 3, 4, 5, 10, 20):
    print(f"  n={n:2d}  a_n={a_n(n):.5f}   2/(n a_n^2)={lam_participation(n):.3f}")
print(f"  closed form a_2 = 1/(2 sqrt(pi)) = {1/(2*math.sqrt(math.pi)):.5f}; a_3 equals a_2 exactly")

print("\nE2  precision ceiling: largest lam=V/sigma^2 with a pure symmetric equilibrium")
LM = {}
for n in (2, 3, 5, 10, 20):
    LM[n] = lam_max(n)
    print(f"  n={n:2d}  lam_max={LM[n]:.3f}  participation limit={lam_participation(n):.3f}  ratio={LM[n]/lam_participation(n):.3f}")

print("\nE3  holdout size m at V=1, s=1, n=5 (sigma=1/sqrt(m)); effort and rent, with equilibrium check")
n, V, s = 5, 1.0, 1.0
print(f"  m_cap = lam_max*s^2/V = {LM[5]*s*s/V:.2f}")
for m in (1, 2, 4, 6, 8):
    sig = s / math.sqrt(m)
    e = eq_effort(V, sig, n)
    ok = deviation_gap(V, sig, n) <= 1e-6
    rent = V / n - e * e / 2
    print(f"  m={m:2d}  sigma={sig:.3f}  e*={e:.3f}  rent/player={rent:.3f}  pure_eq={ok}  best deviation gain={max(0.0, deviation_gap(V, sig, n)):.4f}")

print("\nE4  above the ceiling: best-reply of everyone to the others' FOC effort (n=5, V=1, s=1)")
for m in (6, 8, 12):
    sig = s / math.sqrt(m)
    e = eq_effort(V, sig, n)
    b, u = best_response(e, V, sig, n, grid=800)
    print(f"  m={m:2d}  FOC effort {e:.3f}  best reply {b:.3f}  gain {u - utility(e, e, V, sig, n):.4f}")

print("\nE5  organiser: w*e* - V - kappa*m with w=3 (n=5, s=1, V=1)")
for kappa in (0.5, 0.2, 0.05, 0.001):
    m, cap, free = best_m(V, s, n, kappa, 3.0)
    val = principal_value(V, m, s, n, kappa, 3.0)
    print(f"  kappa={kappa:<6}  m*={m:.2f} (cap {cap:.2f}, unconstrained {free:.2f})  binding={'cap' if m == cap else 'cost'}  net value={val:.3f}")

print("\nE6  Monte Carlo check of win probability (n=4)")
for d in (0.0, 0.5, 1.5):
    print(f"  d={d}  integral={win_prob(d, 4):.4f}  MC(2e5)={mc_win_prob(d, 4, 200000, seed=7):.4f}")
