"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from robust_outer import *

A = [1.0, 0.25, 0.05]
eta, sg = 0.2, 1.0

print("== 1. Exact floor vs literal outer-loop simulation (H=4, 3 modes a=1,.25,.05, alpha=0.5, N=15; 150k rounds; attackers at +1e6 sigma, mean at +1.5 sigma) ==")
print("aggregator     f  E b (mean)  N Var b   exact      sim        ratio")
H, al, N = 4, 0.5, 15
for kind, ranks, f, dl in (("mean", ranks_mean(N), 0, 0.0), ("median", ranks_median(N), 0, 0.0), ("median", ranks_median(N), 2, 1e6),
                           ("trim3", ranks_trimmed(N, 3), 3, 1e6), ("mean", ranks_mean(N), 2, 1.5)):
    m, v = bias_var(N, f, ranks, dl, mc=400000)
    th = floor(A, eta, sg, N, H, al, m, v)
    emp = sim_floor(kind, A, eta, sg, N, f, dl, H, al, 150000, 1000, seed=1)
    print("%-13s %2d  %8.4f    %.4f   %.5f   %.5f   %.3f" % (kind, f, m, N * v, th, emp, emp / th))
th_lit = None
m, v = bias_var(9, 2, ranks_median(9))
x2 = simulate_literal("median", A, eta, sg, 9, 2, 1e6, 3, 0.5, 40000, 500, seed=2)
print("literal local steps (N=9, f=2, median, H=3): sim %.5f vs exact %.5f" % (sum(0.5 * a * y for a, y in zip(A, x2)), floor(A, eta, sg, 9, 3, 0.5, m, v)))

print("\n== 2. Price of robustness with no attackers: N Var(b), mean = 1 ==")
print("N     median   trim 1   trim N/4   pi/2")
for N in (3, 5, 9, 15, 31, 101):
    row = [efficiency(N, ranks_median(N))]
    row.append(efficiency(N, ranks_trimmed(N, 1), mc=200000, seed=1) if N >= 5 else float("nan"))
    row.append(efficiency(N, ranks_trimmed(N, max(1, N // 4)), mc=200000, seed=2) if N >= 9 else float("nan"))
    print("%-5d %.4f   %.4f   %.4f     %.4f" % (N, row[0], row[1], row[2], math.pi / 2))

print("\n== 3. Worst-case bias in honest-noise sigmas: median of N with f one-sided attackers; asymptotic z(eps): Phi(z)=1/(2(1-eps)) ==")
print("eps=f/N  N=16     N=32     N=128    z(eps)   1.2533 eps   mean bias per unit offset (= eps)   break-even offset z/eps")
for eps in (1 / 16, 1 / 8, 1 / 4, 3 / 8):
    b = [bias_only(N, int(round(eps * N)), ranks_median(N)) for N in (16, 32, 128)]
    print("%.4f   %.4f   %.4f   %.4f   %.4f   %.4f       %.4f                              %.3f sigma" % (
        eps, b[0], b[1], b[2], median_bias_asymptotic(eps), 1.2533 * eps, eps, median_bias_asymptotic(eps) / eps))

print("\n== 4. Bias loss versus sync interval H (median, N=15, f=2; eta=0.2, sigma=1; bias loss per mode, a=0.25) ==")
m, v = bias_var(15, 2, ranks_median(15))
print("E b = %.4f" % m)
print("H     Vw/s^2   bias loss   sqrt((1+q^H)/(1-q^H))   single-worker SGD std (limit)")
q = 1 - eta * 0.25
for H in (1, 2, 4, 16, 64, 256):
    s = curvature(eta, 0.25, H); Vw = worker_noise(eta, 0.25, sg, H)
    print("%-5d %.4f   %.5f     %.4f                  %.4f" % (H, Vw / s / s, floor_parts([0.25], eta, sg, 15, H, 0.5, m, v)[1],
          math.sqrt((1 + q ** H) / (1 - q ** H)), eta * sg / math.sqrt(1 - q * q)))

print("\n== 5. More workers do not remove the attack bias (eps = 1/8 attackers, H=4, alpha=0.2, a=(1,.25,.05)) ==")
print("N     f    variance loss  bias loss   total    (mean, attackers at +2 sigma: total)")
for N, f in ((8, 1), (16, 2), (32, 4), (64, 8), (128, 16)):
    m, v = bias_var(N, f, ranks_median(N))
    vl, bl = floor_parts(A, eta, sg, N, 4, 0.2, m, v)
    m2, v2 = bias_var(N, f, ranks_mean(N), 2.0)
    print("%-5d %-4d %.5f        %.5f     %.5f   %.5f" % (N, f, vl, bl, vl + bl, floor(A, eta, sg, N, 4, 0.2, m2, v2)))

print("\n== 6. Which trim level? N=32, f=4, worst-case attackers, H=4, alpha=0.2 ==")
best, rows = best_trim(A, eta, sg, 32, 4, 4, 0.2, mc=150000, seed=1)
print("t    variance loss  bias loss   total")
for t, vl, bl in rows:
    if t in (4, 5, 6, 8, 10, 12, 15):
        print("%-4d %.5f        %.5f     %.5f%s" % (t, vl, bl, vl + bl, "   <- best" if t == best[0] else ""))
print("best t over all t>=f: %d" % best[0])
print("worst-case bias (sigmas) by trim level, N=32: " + "  ".join("f=%d: t=f %.3f, t=15 (median) %.3f" % (f, bias_only(32, f, ranks_trimmed(32, f)), bias_only(32, f, ranks_trimmed(32, 15))) for f in (1, 2, 4, 8)))

print("\n== 7. Offset crossover: mean vs median vs trim(f), N=15, f=2, H=4, alpha=0.2: total loss as the attack offset grows ==")
print("offset (sigma)  mean      median    trim2")
mM, vM = bias_var(15, 2, ranks_median(15)); mT, vT = bias_var(15, 2, ranks_trimmed(15, 2), mc=300000, seed=1)
for dl in (0.25, 0.5, 1.0, 1.5, 3.0, 10.0, 100.0):
    m0, v0 = bias_var(15, 2, ranks_mean(15), dl)
    print("%-15g %.5f   %.5f   %.5f" % (dl, floor(A, eta, sg, 15, 4, 0.2, m0, v0), floor(A, eta, sg, 15, 4, 0.2, mM, vM), floor(A, eta, sg, 15, 4, 0.2, mT, vT)))
print("break-even offset (median): %.3f sigma; (trim2): %.3f sigma" % (breakeven_delta(15, 2, ranks_median(15)), breakeven_delta(15, 2, ranks_trimmed(15, 2), mc=300000, seed=1)))
