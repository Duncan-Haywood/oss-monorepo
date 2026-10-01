import math
from interval_elicitation import *

N = ("normal", 0.0, 1.0)
LN = ("lognormal", 0.0, 1.0)
C = ("cauchy", 0.0, 1.0)

print("E1  normal: interval-score regret of a scale misreport lam (symmetric [-lam z, lam z]), alpha = 0.05 / 0.32")
for a in (0.05, 0.32):
    print(f"  alpha={a}  z={z_upper(a):.4f}  " + "  ".join(f"lam={l}: {normal_scale_regret(l, a):.4f}" for l in (0.5, 0.8, 0.9, 1.1, 1.25, 2.0)))

print("E2  Cauchy: expected interval score is infinite (no mean) but regret is finite; alpha=0.1, symmetric shrink/inflate")
a = 0.1
l0, u0 = quantile(a / 2, C), quantile(1 - a / 2, C)
print(f"  q = [{l0:.3f}, {u0:.3f}]  " + "  ".join(f"lam={k}: {interval_regret(k*l0, k*u0, a, C):.4f}" for k in (0.5, 0.8, 1.25, 2.0)))

print("E3  lognormal(0,1): equal-tailed vs shortest interval at the same coverage")
for cov in (0.8, 0.9, 0.95, 0.99):
    a = 1 - cov
    et = quantile(a / 2, LN), quantile(1 - a / 2, LN)
    # find lam whose HPD interval has this coverage
    lo, hi = 1.0, 1e6
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        l, u = hpd_interval(mid, LN)
        if coverage(l, u, LN) > cov:
            hi = mid
        else:
            lo = mid
    lam = math.sqrt(lo * hi)
    l, u = hpd_interval(lam, LN)
    print(f"  cov={cov}: ET [{et[0]:.3f},{et[1]:.3f}] width {et[1]-et[0]:.3f} | HPD [{l:.3f},{u:.3f}] width {u-l:.3f} "
          f"({(1-(u-l)/(et[1]-et[0]))*100:.0f}% shorter) lam={lam:.2f} | H-regret of ET {hpd_regret(et[0], et[1], lam, LN):.4f} "
          f"| IS-regret of HPD {interval_regret(l, u, a, LN):.4f}")

print("E4  detection: tasks to detect (z=1.645) a 20% understatement of a symmetric N(0,1) tolerance, matched coverage")
print("    alpha  z     IS: n     H(lam=1/f(z)): n     payment range IS(>)  H")
for a in (0.5, 0.32, 0.2, 0.1, 0.05, 0.01):
    z = z_upper(a)
    lam = 1 / pdf(z, N)
    m1, v1 = diff_moments(-0.8 * z, 0.8 * z, -z, z, lambda l, u, y: interval_score(l, u, y, a), N, -14, 14, 60000)
    m2, v2 = hpd_diff_moments(-0.8 * z, 0.8 * z, -z, z, lam, N)
    print(f"    {a:<6} {z:.3f}  {detection_n(m1, v1):8.1f}    {detection_n(m2, v2):8.1f}            "
          f"unbounded   {2*z+lam:.1f}")

print("E5  curvature: regret ~ k*delta^2 for a widening of BOTH ends by delta:")
print("   IS  k=(2/alpha) phi(z)   H  k=z")
for a in (0.32, 0.1, 0.05):
    z = z_upper(a)
    lam = 1 / pdf(z, N)
    d = 0.01
    ris = interval_regret(-z - d, z + d, a, N)
    rh = hpd_regret(-z - d, z + d, lam, N)
    print(f"    alpha={a}: IS regret/d^2={ris/d/d:.3f} (theory {2/a*pdf(z,N):.3f})   H regret/d^2={rh/d/d:.3f} (theory {z:.3f})")
