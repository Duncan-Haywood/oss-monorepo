import math
from categorical_scores import *

print("E1 worst-case regret (exact vertex formulas), K=5")
for name, p in (("uniform", uniform(5)), ("rare rho=0.01", rare_class(5, .01)), ("rare rho=0.001", rare_class(5, .001))):
    print(f" {name:15s} brier max {max_regret_brier(p):.4f} (range 2)  spherical max {max_regret_spherical(p):.4f} (range 1)  log max inf")

print("\nE2 curvature per unit payment range for moving mass between classes 0 and 1 (regret / eps^2)")
print(" Brier range 2, spherical range 1; log has no range. K=5, truth rare_class(5, rho)")
for rho in (.5, .2, .05, .01, .001):
    p = rare_class(5, rho)
    d = [1, -1, 0, 0, 0]
    b, s, l = curv_brier(p, d) / 2, curv_spherical(p, d) / 1, curv_log(p, d)
    print(f" rho={rho:<6g} brier/range {b:8.3f}  spherical/range {s:8.3f}  ratio {s/b:6.3f}  log(unbounded) {l:10.1f}")

print("\nE3 uniform truth: spherical/Brier curvature per range = sqrt(K)")
for K in (2, 4, 9, 16, 100):
    p = uniform(K)
    d = [1, -1] + [0] * (K - 2)
    print(f" K={K:<4d} ratio {(curv_spherical(p,d)/1)/(curv_brier(p,d)/2):7.3f}  sqrt(K) {math.sqrt(K):7.3f}")

print("\nE4 dropping the rare class (report r_0 = tiny, renormalise), K=5")
for rho in (.05, .01, .001):
    p = rare_class(5, rho)
    r = [1e-9] + [x / (1 - rho) * (1 - 1e-9) for x in p[1:]]
    print(f" rho={rho:<6g} brier {brier_regret(r,p):.6f}  spherical {spherical_regret(r,p):.6f}  log {kl(p,r):.6f}")
