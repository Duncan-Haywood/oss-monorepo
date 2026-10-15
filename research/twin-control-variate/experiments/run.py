"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from twin_control_variate import *

a, b, q, r = 0.9, 1.0, 1.0, 0.1
k, T, s2 = 0.4, 30, 1.0
c = q + r * k * k
al = closed_loop(a, b, k)
mu, vr = mean_cost(al, T, c), var_cost(al, T, c)
print("plant a=%.1f b=%.1f, fixed policy k=%.1f (closed loop %.2f), q=%.1f r=%.1f, horizon T=%d, s2=1; real rollout cost: mean %.3f, sd %.3f" % (a, b, k, al, q, r, T, mu, math.sqrt(vr)))

print("\n== 1. Twin/plant correlation rho (exact) by twin gain error and replayable disturbance fraction lam; bias of the twin-only estimate ==")
print("bhat   alpha_hat  bias/mean   1-rho(lam=1)  rho(0.8)  rho(0.5)  rho(0.2)")
for bh in (1.0, 0.95, 0.9, 0.8, 0.6, 1.2):
    at = closed_loop(a, bh, k)
    print("%.2f   %.3f      %+.3f      " % (bh, at, bias(al, at, T, c) / mu) + "%.1e   " % (1 - rho(al, at, T, 1.0)) + "   ".join("%.3f   " % rho(al, at, T, lam) for lam in (0.8, 0.5, 0.2)))

print("\n== 2. Optimal split and speed-up at equal budget (cost ratio w = twin/real) ==")
print("rho     w       N/n*    speed-up   limit 1/(1-rho^2) as w->0")
for rr in (0.5, 0.8, 0.9, 0.95, 0.99):
    for w in (0.1, 0.01, 0.001):
        print("%.2f   %.3f   %7.1f   %7.2f    %7.2f" % (rr, w, best_ratio(rr, w), speedup(rr, w), 1 / (1 - rr * rr)))

print("\n== 3. Monte Carlo check of the estimator (bhat=0.9, R=2000 replicates; n paired + N total twin rollouts) ==")
def mc(bh, lam, n, N, R, seed, beta_true):
    at = closed_loop(a, bh, k)
    rng = random.Random(seed)
    rr = rho(al, at, T, lam)
    vt = var_cost(at, T, c)
    bt = rr * math.sqrt(vr / vt) if beta_true else None
    out = [coverage_trial(rng, al, at, T, c, s2, lam, n, N, bt) for _ in range(R)]
    return rr, out
print("lam  n   N     rho     var real-only(formula) var CV(formula)  var CV(sim, true beta)  var CV(sim, est beta)  bias CV(sim)/sd  MSE twin-only")
for lam in (1.0, 0.8):
    for n, N in ((20, 40), (20, 100), (20, 400), (20, 1000)):
        rr, o1 = mc(0.9, lam, n, N, 2000, 11, True)
        _, o2 = mc(0.9, lam, n, N, 2000, 11, False)
        v = lambda o, i: sum((t[i] - mu) ** 2 for t in o) / len(o)
        bs = sum(t[2] - mu for t in o1) / len(o1)
        print("%.1f  %2d  %4d  %.3f   %.3f                  %.3f               %.3f                  %.3f                 %+.3f           %.3f" % (lam, n, N, rr, vr / n, cv_variance(vr, n, N, rr), v(o1, 2), v(o2, 2), bs / math.sqrt(vr), v(o2, 4)))

print("\n== 4. Coverage of nominal 95% intervals (normal quantile 1.96), R=2000, lam=0.8; twin gain error bhat=0.8 ==")
print("bhat  n    N      real-only  control-variate  twin-only    (twin bias/mean %+.3f)" % (bias(al, closed_loop(a, 0.8, k), T, c) / mu))
for bh in (0.8,):
    for n, N in ((10, 200), (20, 400), (40, 800), (20, 1600)):
        rr, o = mc(bh, 0.8, n, N, 2000, 21, False)
        cov = lambda i: sum(abs(t[i] - mu) <= 1.96 * t[i + 1] for t in o) / len(o)
        print("%.1f  %3d  %5d   %.3f      %.3f            %.3f" % (bh, n, N, cov(0), cov(2), cov(4)))

print("\n== 5. When to trust the twin alone: real sample size n^ = var_real / bias^2 below which twin-only MSE beats n real rollouts (N -> infinity) ==")
print("bhat   bias/mean   bias/sd(real)   n^")
for bh in (0.98, 0.95, 0.9, 0.8, 0.6):
    at = closed_loop(a, bh, k)
    d = bias(al, at, T, c)
    print("%.2f   %+.4f     %+.3f          %.1f" % (bh, d / mu, d / math.sqrt(vr), twin_only_crossover(vr, d)))

print("\n== 6. Worked example: budget for a 5% (95% half-width) certificate of mean cost, real rollout cost 1, twin 0.01 ==")
target = 0.05 * mu
for bh, lam in ((0.95, 0.95), (0.9, 0.8), (0.8, 0.8), (0.8, 0.3)):
    at = closed_loop(a, bh, k)
    rr = rho(al, at, T, lam)
    B_real = (1.96 ** 2) * vr / target ** 2
    B_cv = B_real * (best_variance(vr, 1.0, rr, 0.01) / vr)
    print("bhat=%.2f lam=%.2f rho=%.3f: real-only budget %.0f, control-variate budget %.0f (%.1fx cheaper), n*=%.0f real + N*=%.0f twin rollouts" % (bh, lam, rr, B_real, B_cv, B_real / B_cv, B_cv / (1 + best_ratio(rr, 0.01) * 0.01), B_cv / (1 + best_ratio(rr, 0.01) * 0.01) * best_ratio(rr, 0.01)))
