"""Reproduces every number in paper/whitepaper.md. Pure Python, ~2 minutes."""
import math, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from twin_monitor import *

a, b, q, r, s2, tau2, alpha = 0.9, 1.0, 1.0, 0.1, 1.0, 1.0, 0.05


def med(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2]


print("plant a=%.1f b=%.1f q=%.1f r=%.1f s2=%.1f; mixture prior tau2=%.1f; alpha=%.2f" % (a, b, q, r, s2, tau2, alpha))

print("\n== 1. False alarms under peeking (twin exact, dither v=0.2, T=2000, 1000 runs) ==")
n = 1000
fe = sum(run_monitor(a, b, a, b, optimal_gain(a, b), 0.2, alpha, 2000, s2, tau2, s) is not None for s in range(n))
fp = sum(run_peeking(a, b, a, b, optimal_gain(a, b), 0.2, 2000, s2, s) is not None for s in range(n))
print("e-process alarm rate %.3f (bound %.2f); peeking chi2(2) 5%% test alarm rate %.3f" % (fe / n, alpha, fp / n))

print("\n== 2. Detection delay, twin b_hat=1.4 b (a exact), gain k*(twin), regret %.4f ==" % regret(a, b, optimal_gain(a, 1.4 * b, q, r), q, r, s2))
ah, bh = a, 1.4 * b
k = optimal_gain(ah, bh, q, r)
print("  v     KL rate   L/rate   predicted   sim median  sim mean   alarmed(T=6000)")
for v in (0.0, 0.05, 0.2, 1.0):
    ds = [run_monitor(a, b, ah, bh, k, v, alpha, 6000, s2, tau2, s) for s in range(300)]
    ok = [d for d in ds if d]
    print("  %-5.2f %.5f  %7.1f  %9.1f  %9d  %8.1f   %d/300" % (v, kl_rate(a, b, k, ah - a, bh - b, v, s2), simple_delay(alpha, a, b, k, ah - a, bh - b, v, s2),
          predicted_delay(alpha, a, b, k, ah - a, bh - b, v, s2, tau2), med(ok), sum(ok) / len(ok), len(ok)))

print("\n== 3. The closed-loop blind line (twin's own gain k satisfies a_hat - a = k (b_hat - b)) ==")
for ahat in (0.7, 1.0, 0.5):
    bh, k = blind_twin(a, b, ahat, q, r)
    da, db = ahat - a, bh - b
    R = regret(a, b, k, q, r, s2)
    print(" twin a_hat=%.2f b_hat=%.4f k=%.4f, da/db=%.4f: regret R=%.4f; per-step dither cost c_d=%.4f" % (ahat, bh, k, da / db, R, dither_cost_per_v(a, b, k, q, r)))
    print("  v      rate     rho*v(=db^2 v/2)  predicted  sim median  alarmed(T=40000)")
    for v in (0.0, 0.05, 0.2, 1.0):
        ds = [run_monitor(a, b, ahat, bh, k, v, alpha, 40000, s2, tau2, s) for s in range(100)]
        ok = [d for d in ds if d]
        pd = predicted_delay(alpha, a, b, k, da, db, v, s2, tau2)
        print("  %-5.2f %.6f  %.6f          %9s  %9s  %d/100" % (v, kl_rate(a, b, k, da, db, v, s2), db * db * v / 2, "inf" if math.isinf(pd) else "%.0f" % pd,
              med(ok) if ok and v > 0 else "-", len(ok)))

print("\n== 4. Is dithering worth it? Optimal dither v* (0 = monitor passively), prior of a bad twin pi, horizon H, alpha=0.05 ==")
for ahat in (0.7, 1.6, 0.5):
    bh, k = blind_twin(a, b, ahat, q, r)
    da, db = ahat - a, bh - b
    R = regret(a, b, k, q, r, s2)
    for pi, H in ((0.1, 10 ** 4), (0.5, 10 ** 5)):
        v, c = optimal_dither(a, b, k, da, db, pi, H, alpha, q, r, s2)
        vm, cm = optimal_dither(a, b, k, da, db, pi, H, alpha, q, r, s2, tau2=tau2, ngrid=150)
        print(" a_hat=%.1f (b_hat=%.3f, R=%.4f) pi=%.1f H=%-6d  leading-order v*=%.4f cost %.2f (closed form %.4f); mixture-delay v*=%.4f cost %.2f; never detect %.2f" % (
            ahat, bh, R, pi, H, v, c, optimal_dither_blind(a, b, k, db, pi, H, alpha, q, r, s2), vm, cm, pi * H * R))
print(" simulated cost for a_hat=0.5, pi=0.5, H=1e5: (1-pi) H c_d v + pi (R + c_d v) min(E[N], H), 60 runs")
ahat = 0.5
bh, k = blind_twin(a, b, ahat, q, r)
da, db = ahat - a, bh - b
R, cd = regret(a, b, k, q, r, s2), dither_cost_per_v(a, b, k, q, r)
pi, H = 0.5, 10 ** 5
for v in (0.001, 0.0034, 0.01, 0.03, 0.1, 0.3):
    ds = [run_monitor(a, b, ahat, bh, k, v, alpha, 200000, s2, tau2, s) for s in range(60)]
    N = sum(d if d else 200000 for d in ds) / len(ds)
    print("  v=%-6.4f mean delay %8.0f  simulated total %9.2f   leading-order %9.2f   mixture-delay %9.2f" % (v, N, (1 - pi) * H * cd * v + pi * (R + cd * v) * min(N, H),
          monitoring_cost(v, a, b, k, da, db, pi, H, alpha, q, r, s2), monitoring_cost(v, a, b, k, da, db, pi, H, alpha, q, r, s2, tau2)))
