"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from randomized_twin import *

a, b, q, r = 0.9, 1.0, 1.0, 0.1
ks = optimal_gain(a, b)
fmt = lambda x: "inf" if math.isinf(x) else "%.4f" % x
print("plant a=%.1f, twin b_hat=%.1f, q=%.1f, r=%.1f; nominal gain k*=%.4f; nominal gain stable iff b < (1+a)/k* = %.3f b_hat" % (a, b, q, r, ks, (1 + a) / ks))

print("\n== 1. Randomised gain k_eps and the price when the twin is exactly right ==")
print("eps    k_eps    small-eps law   price (regret at b=b_hat)   minimax gain   worst regret DR / minimax / nominal")
for e in (0.1, 0.2, 0.3, 0.5, 0.7, 0.9):
    kd, km = dr_gain(a, b, e), minimax_gain(a, b, e)
    print("%.1f    %.4f   %.4f          %.5f                     %.4f         %s / %s / %s" % (
        e, kd, dr_gain_local(a, b, e), price_of_randomization(a, b, e), km,
        fmt(worst_regret(a, b, e, kd)), fmt(worst_regret(a, b, e, km)), fmt(worst_regret(a, b, e, ks))))

print("\n== 2. Deployment regret by true plant b/b_hat, for gains trained at width eps ==")
ds = (0.5, 0.7, 0.9, 1.0, 1.2, 1.5, 1.9, 2.3, 2.5, 2.7)
print("eps    " + "  ".join("%6.1f" % d for d in ds))
for e in (0.0, 0.3, 0.6, 0.9):
    print("%.1f    " % e + "  ".join("%6s" % (("inf" if math.isinf(dr_regret(a, b * d, b, e)) else "%.3f" % dr_regret(a, b * d, b, e))) for d in ds))
print("gain stability limits (1+a)/k: " + ", ".join("eps=%.1f: %.3f b_hat" % (e, (1 + a) / dr_gain(a, b, e)) for e in (0.0, 0.3, 0.6, 0.9)))

print("\n== 3. Regret-averaged over a prior of plants: b/b_hat ~ U[1-w, 1+w'] : which width is best? ==")
print("prior range of true b/b_hat        best eps (grid)   mean regret at best / at eps=0")
for lo, hi in ((0.9, 1.1), (0.7, 1.3), (0.5, 1.5), (0.5, 2.0), (0.5, 2.4)):
    def avg(e):
        k = dr_gain(a, b, e)
        n = 400
        return sum(min(1e3, regret(a, b * (lo + (hi - lo) * (i + 0.5) / n), k)) for i in range(n)) / n
    grid = [i / 20 for i in range(0, 19)]
    best = min(grid, key=avg)
    print("[%.1f, %.1f]                        %.2f              %.4f / %.4f" % (lo, hi, best, avg(best), avg(0.0)))

print("\n== 4. Cliff: any sampled plant that destabilises the gain makes the training objective infinite ==")
for k in (1.0, 1.25, 1.5, 1.75):
    print("gain k=%.2f: largest safe width eps = %.4f (b up to %.3f b_hat)" % (k, cliff_eps(a, b, k), (1 + a) / k))
