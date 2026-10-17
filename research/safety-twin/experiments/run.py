"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from safety_twin import *

A, T, S = 0.8, 200, 0.1
NREF = 100000
sx = stat_sd(A, S)
print("Corridor keeping x_{t+1} = a x_t + w_t, a=%.1f, w variance s^2 (s=%.2f m), stationary sd %.4f m, T=%d steps (after a %d-step burn-in)." % (A, S, sx, T, BURN))
print("Twin: w Gaussian.  Real: w Student-t(nu) rescaled to the same variance (same one-step variance, kurtosis 6/(nu-4) for nu>4, infinite for nu<=4).")
print("Twin certificate: margin L with T * P(|x|>L) <= delta, x ~ N(0, sx^2)  (union bound, so an upper bound on the twin's own failure).")

rng = random.Random(7)
gs = max_sample(NREF, A, T, S, "gauss", rng)
ref = {nu: max_sample(NREF if nu == 3 else 20000, A, T, S, "t", rng, nu) for nu in (3, 4, 5, 8)}
se = lambda p, n: math.sqrt(max(p, 1 / n) * (1 - p) / n)

print("\n== 1. Real failure probability at the twin-certified margin (episodes of T=%d steps) ==" % T)
print("delta  L_twin (m)  twin fail (sim, n=%d)   real fail: nu=3 (n=%d)  nu=4 (n=20000)  nu=5   nu=8" % (NREF, NREF))
for d in (0.05, 0.01, 0.001):
    L = twin_margin(A, T, S, d)
    row = ["%.4f +- %.4f" % (fail_frac(gs, L), se(fail_frac(gs, L), NREF))]
    for nu in (3, 4, 5, 8):
        p = fail_frac(ref[nu], L)
        row.append("%.4f +- %.4f" % (p, se(p, len(ref[nu]))))
    print("%-6g %.3f       %s" % (d, L, "   ".join(row)))

print("\n== 2. Margin that a heavy-tail-aware certificate needs (single-big-jump tail, union bound over T) ==")
print("delta   L_twin   L_real nu=3 (ratio)   nu=4 (ratio)   nu=5 (ratio)   nu=8 (ratio)")
for d in (0.05, 0.01, 0.001, 0.0001):
    Lt = twin_margin(A, T, S, d)
    cells = []
    for nu in (3, 4, 5, 8):
        Lr = real_margin(A, T, S, nu, d)
        cells.append("%.3f (%.2fx)" % (Lr, Lr / Lt))
    print("%-7g %.3f    %s" % (d, Lt, "    ".join(cells)))
print("Real failure at the nu=3 big-jump margin (reference sample n=%d; the union bound is conservative):" % NREF)
for d in (0.05, 0.01, 0.001):
    Lr = real_margin(A, T, S, 3, d)
    p = fail_frac(ref[3], Lr)
    print("  delta=%-6g L=%.3f  real fail %.5f (target <= %g)" % (d, Lr, p, d))

print("\n== 3. Repairs from real data (nu=3 truth; failure read from the n=%d reference sample) ==" % NREF)
print("(a) Conformal margin from n real episode maxima, 300 draws of n maxima from the reference sample")
print("n      delta   share with a finite margin   mean real fail   90th pct of real fail")
cr = random.Random(11)
for n in (50, 100, 200, 1000):
    for d in (0.05, 0.01, 0.001):
        fs = []
        for _ in range(300):
            m = conformal_margin(sorted(cr.choice(ref[3]) for _ in range(n)), d)
            if m != float("inf"):
                fs.append(fail_frac(ref[3], m))
        if fs:
            fs.sort()
            print("%-6d %-7g %-29.2f %-16.4f %.4f" % (n, d, len(fs) / 300, sum(fs) / len(fs), fs[int(0.9 * len(fs)) - 1]))
        else:
            print("%-6d %-7g %-29.2f -                no bound (n < 1/delta - 1)" % (n, d, 0))
print("(b) Gaussian twin with variance inflated so its 95th-percentile episode maximum matches the real one (fitted at delta=0.05), then used for delta=0.001")
q = lambda xs, p: xs[min(len(xs) - 1, int(p * len(xs)))]
scale = q(ref[3], 0.95) / q(gs, 0.95)
for d in (0.05, 0.01, 0.001):
    L = scale * q(gs, 1 - d)
    print("  fitted scale %.2f  delta=%-6g  margin %.3f  real fail %.5f  (real margin for delta: %.3f)" % (scale, d, L, fail_frac(ref[3], L), q(ref[3], 1 - d)))
print("(c) Hill tail-index fit to n one-step disturbances (top k=5% of |w|) + Pareto big-jump margin at delta=0.001; 200 repeats; true tail index 3")
print("n       alpha_hat median [10,90]%        real fail median [10,90]%   share of repeats with real fail > 0.001")
hr = random.Random(13)
D = 0.001
for n in (500, 2000, 10000, 50000):
    al, fl = [], []
    for _ in range(200):
        ws = [sample_w("t", S, hr, 3) for _ in range(n)]
        k = int(0.05 * n)
        alpha, xk = hill_alpha(ws, k)
        Lm = pareto_margin(A, T, n, k, alpha, xk, D)
        al.append(alpha)
        fl.append(fail_frac(ref[3], Lm))
    al.sort(); fl.sort()
    pc = lambda xs, p: xs[int(p * (len(xs) - 1))]
    print("%-7d %.2f [%.2f, %.2f]                 %.5f [%.5f, %.5f]      %.2f" % (n, statistics.median(al), pc(al, .1), pc(al, .9), statistics.median(fl), pc(fl, .1), pc(fl, .9), sum(f > D for f in fl) / len(fl)))
print("(d) Known-nu oracle: real_margin(nu=3, delta=0.001) = %.3f, real fail %.5f" % (real_margin(A, T, S, 3, D), fail_frac(ref[3], real_margin(A, T, S, 3, D))))
