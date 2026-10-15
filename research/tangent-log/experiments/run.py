import math, random
from tangent_log import *

print("E1 range R_eps = ln((1-eps)/eps)+1/(1-eps) vs plain log clip ln(1/eps)")
for eps in (.2, .05, .01, .001, 1e-4, 1e-6):
    print(f" eps={eps:g} R={score_range(eps):8.4f}  loss(0,1)={loss(0,1,eps):8.4f}  clip ln(1/eps)={math.log(1/eps):8.4f}")

print("\nE2 curvature per unit range (Brier = 2.0) at truth p, eps=1e-3")
eps = 1e-3
for p in (1e-4, 1e-3, 1e-2, .1, .5):
    print(f" p={p:g} tangent-log {efficiency(p,eps):8.2f}  brier 2.00  ratio {efficiency(p,eps)/2:7.2f}")
print(" crossover p (tangent better below):", {e: round(crossover(e), 4) for e in (.2, .05, .01, .001)})

print("\nE3 worst-case misreport: expected loss of report r when truth p=1e-3 (eps=1e-4)")
p, eps = 1e-3, 1e-4
for r in (1e-3, 1e-4, 1e-6, 1e-9, 0.0):
    lg = "inf" if r == 0 else f"{p*-math.log(r)+(1-p)*-math.log(1-r):.4f}"
    print(f" r={r:g}: tangent {exp_loss(r,p,eps):.4f}   log {lg}")

print("\nE4 best eps for curvature per range at truth p is eps=p")
for p in (.3, .05, .001):
    e = best_eps(p)
    print(f" p={p:g}: eps*={e:.6f}  efficiency={efficiency(p,e):.3f}  at eps=p/3: {efficiency(p,p/3):.3f}  at 3p: {efficiency(p,3*p):.3f}")
print("\nkappa_eps (constant offset vs -ln r):", {e: round(kappa(e), 6) for e in (.2, .05, .001)})
