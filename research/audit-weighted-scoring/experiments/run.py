"""Deterministic experiments; output in results.txt."""
from audit_weighted_scoring import *

print("E1  naive scheme under audit rate g(r)=a+b r: report shift vs first-order formula (a=0.2)")
for b in (0.1, 0.3, 0.6):
    for p in (0.2, 0.5, 0.9):
        r = naive_report(p, .2, b)
        print(f"  b={b} p={p}: report {r:.4f}  shift {r-p:+.4f}  first-order {naive_shift_first_order(p,.2,b):+.4f}  excess Brier {(r-p)**2:.5f}")

print("\nE2  IPW: mean and variance by Monte Carlo (g(r)=0.1+0.8r, r=0.7, p=0.4, 600000 tasks)")
g = lambda r: 0.1 + 0.8 * r
m, v = simulate_ipw(.7, .4, g, 600000, 5)
print(f"  mean sim {m:.4f} exact {loss(.7,.4):.4f}   var sim {v:.4f} exact {ipw_variance(.7,.4,g):.4f}")

print("\nE3  Neyman audit allocation vs uniform, p~Beta(a,b), budget gamma=0.1")
for a, b in ((1, 1), (2, 2), (0.5, 0.5), (1, 5)):
    d = grid(4000, a, b)
    print(f"  Beta({a},{b}): variance ratio {variance_ratio(.1,d):.3f}")

print("\nE4  audit-rate floor (payout cap 1/gmin) vs variance, p~U(0,1), gamma=0.1")
d = grid(4000)
for gmin in (0.0, 0.02, 0.05, 0.08):
    cap = "inf" if gmin == 0 else f"{max_payout(gmin):.0f}"
    print(f"  gmin={gmin}: max payout {cap}  variance ratio vs uniform {variance_ratio(.1,d,gmin):.3f}")
