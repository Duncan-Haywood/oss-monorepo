import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from effort_elicitation.model import *

c = 1e-3
N = 300
priors = {"uniform Beta(1,1)": (1, 1), "rare-fault Beta(0.2,5)": (0.2, 5), "U-shaped Beta(0.3,0.3)": (0.3, 0.3)}

print("== 1. Implementable efforts (vertices of concave envelope of V), n<=%d" % N)
for name, (a, b) in priors.items():
    for r in RULES:
        V = value_curve(r, a, b, N)
        h = concave_envelope_vertices(V)
        missing = [n for n in range(1, 61) if n not in h]
        print(f"{name:26s} {r:9s} non-implementable n in 1..60: {len(missing):2d}  first: {missing[:8]}")

print("\n== 2. Cheapest scale alpha implementing n*=20 (c=%g), rent, payout spread" % c)
print(f"{'prior':26s} {'rule':9s} {'alpha':>9s} {'rent/cost':>10s} {'spread':>9s} {'spread/cost':>12s}")
for name, (a, b) in priors.items():
    for r in RULES:
        d = design(r, a, b, 20, c, nmax=N)
        if d is None:
            print(f"{name:26s} {r:9s} not implementable")
        else:
            print(f"{name:26s} {r:9s} {d['alpha']:9.4f} {d['rent_per_cost']:10.3f} {d['spread']:9.4f} {d['spread']/(c*20):12.1f}")

print("\n== 3. Effort chosen under a MIS-scaled rule: rules calibrated for n*=20 on Beta(1,1), deployed on rare-fault Beta(0.2,5)")
for r in RULES:
    d = design(r, 1, 1, 20, c, nmax=N)
    Vr = value_curve(r, 0.2, 5, N)
    print(f"{r:9s} alpha={d['alpha']:.4f} -> effort on rare-fault prior: {best_effort(Vr, d['alpha'], c)}")

print("\n== 4. Brier: V(n)=Var(p) n/(a+b+n); n*(alpha) closed form check (Beta(1,1))")
V = value_curve("brier", 1, 1, N)
var = 1/12
for alpha in (0.5, 2, 8, 32):
    approx = max(0, (alpha*var*(2)/c) ** 0.5 - 2)  # continuous optimum sqrt(alpha var (a+b)/c) - (a+b)
    print(f"alpha={alpha:5.1f} exact n*={best_effort(V, alpha, c):3d}  sqrt-law={approx:6.1f}")

print("\n== 5. Brier information rent: rent/cost = (n*-1)/(a+b) (exact, proved in paper) vs exact discrete design")
for a, b in [(1, 1), (0.2, 5), (0.3, 0.3), (2, 8)]:
    for n in (10, 20, 40):
        d = design("brier", a, b, n, c, nmax=4 * n)
        print(f"Beta({a},{b}) n*={n:2d} rent/cost exact={d['rent_per_cost']:6.3f}  (n-1)/(a+b)={(n-1)/(a+b):6.3f}")
