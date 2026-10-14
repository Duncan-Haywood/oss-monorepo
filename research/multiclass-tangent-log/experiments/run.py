import math
import random
from multiclass_tangent_log import *

print("E1 exact payment range of the tangent score = 1 - ln eps, independent of K (max-min of loss over reports and outcomes)")
rng = random.Random(0)
for K in (2, 5, 20):
    for eps in (0.05, 0.001):
        vals = []
        for _ in range(3000):
            x = [rng.expovariate(1) ** 4 for _ in range(K)]; s = sum(x); r = [a / s for a in x]
            vals += [loss(r, y, eps) for y in range(K)]
        for j in range(K):
            e = [float(i == j) for i in range(K)]
            vals += [loss(e, y, eps) for y in range(K)]
        print(f" K={K:<3d} eps={eps:<6g} observed {max(vals)-min(vals):8.4f}  1-ln eps {range_exact(K,eps):8.4f}  (plain clip ln(1/eps) = {-math.log(eps):.4f})")

print("\nE2 worst-case regret (vertex formula), K=5, truth rare_class(5, rho), eps=rho; and per unit payment range")
for rho in (.05, .01, .001):
    p = rare_class(5, rho)
    w = max_regret(p, rho)
    b = 1 - 2 * min(p) + sum(x * x for x in p)
    print(f" rho={rho:<6g} tangent {w:8.4f} /range {w/range_exact(5,rho):.3f}   brier {b:.4f} /range {b/2:.3f}")

print("\nE3 curvature per unit payment range, moving mass between rare class 0 and class 1 (K=5), eps=rho vs Brier (=1.000)")
for rho in (.5, .2, .05, .01, .001, .0001):
    K = 5
    p = rare_class(K, rho)
    d = [1, -1, 0, 0, 0]
    t = curv_per_range(p, d, min(rho, 0.2))
    print(f" rho={rho:<7g} tangent/range {t:9.2f}  brier/range {brier_curv_per_range(d):.3f}  ratio {t/brier_curv_per_range(d):9.2f}")

print("\nE4 best cutoff for truth rho=0.001 (K=5): curvature per range of 0<->1 shift as eps varies")
p = rare_class(5, .001)
d = [1, -1, 0, 0, 0]
best = max((curv_per_range(p, d, e), e) for e in [10 ** (-6 + 0.01 * i) for i in range(0, 500)])
for e in (1e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 1e-1):
    print(f" eps={e:<8g} {curv_per_range(p, d, e):8.3f}")
print(f" grid argmax eps = {best[1]:.5f} (value {best[0]:.3f}); truth p_min = 0.001")

print("\nE5 dropping the rare class (r_0 = 0, rest rescaled), K=5, eps=rho: regret in each score")
for rho in (.05, .01, .001):
    p = rare_class(5, rho)
    r = [0.0] + [x / (1 - rho) for x in p[1:]]
    tb = brier_regret(r, p)
    print(f" rho={rho:<6g} tangent {regret(r,p,rho):.6f}  brier {tb:.6f}  ratio {regret(r,p,rho)/tb:6.1f}  closed form {rho*math.log(1)+rho/2+rho+(1-rho)*math.log(1-rho):.6f}  log inf")

print("\nE6 clipping instead of extending: floor reports at eps and renormalise. truth rho=eps/10 (K=5), eps=0.01")
eps = 0.01
for K in (5,):
    p = rare_class(K, eps / 10)
    c = clip_report(p, eps)
    print(f" best clipped report class-0 mass {c[0]:.5f} vs truth {p[0]:.5f}; regret of clipping under log (unavoidable) {kl(p, c):.6f}")
    print(f" tangent regret of the same clipped report {regret(c, p, eps):.6f}; tangent lets the truth be reported (regret 0)")
    print(f" max payment: clipped log {-math.log(eps):.3f}, tangent range {range_exact(K, eps):.3f}")
