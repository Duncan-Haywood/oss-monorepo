"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics as st
from twin_multifidelity import *

a, b, q, r = 0.9, 1.0, 1.0, 0.1
k = optimal_gain(a, b)
c = a - b * k
J = cost(a, b, k)
print("plant a=%.1f, b=%.1f, q=%.1f, r=%.1f, s2=1; controller k=k*(b)=%.4f, closed-loop c=a-bk=%.4f, real cost J=%.4f; twin gain bh, ch=a-bh*k" % (a, b, q, r, k, c, J))

print("\n== 1. Twin-real cost correlation: closed form vs exact finite-T trace formula vs Monte Carlo (T=200, 6000 paired rollouts) ==")
print("bh    ch       J(twin)  bias    rho long-run  rho exact T=200  rho MC   |  lam=0.8: formula  MC   |  lam=0: MC")
for bh in (1.0, 1.15, 1.3, 1.6, 2.0, 2.3):
    ch = a - bh * k
    row = []
    for lam in (1.0, 0.8, 0.0):
        Y, Yh = simulate_pairs(a, b, bh, k, 200, 6000, lam, seed=7)
        row.append(st.correlation(Y, Yh))
    print("%.2f  %+.4f  %.4f  %+.4f  %.4f        %.4f           %.4f   |  %.4f          %.4f |  %+.4f" % (
        bh, ch, cost(a, bh, k), cost(a, bh, k) - J, corr_long_run(c, ch), corr_finite(c, ch, 200), row[0], corr_long_run(c, ch, 0.8), row[1], row[2]))
print("(twin-only estimate is biased by J(twin)-J; correlation is what a twin is worth as a control variate)")

print("\n== 2. Small-bias law: 1 - rho vs twin gain error (lam=1) ==")
print("dbh     1-rho        (1-rho)/(k dbh)^2   predicted (1+c^4)/(1-c^4)^2 = %.4f" % ((1 + c ** 4) / (1 - c ** 4) ** 2))
prev = None
for d in (0.01, 0.02, 0.05, 0.1, 0.2, 0.4):
    rho = corr_long_run(c, a - (b + d) * k)
    print("%.2f   %.3e    %.4f" % (d, 1 - rho, (1 - rho) / (k * d) ** 2))
print("noise-sharing: rho scales as lam^2 exactly (formula) -- lam=1, .9, .8, .7, .5 at dbh=0.3: " + ", ".join("%.4f" % corr_long_run(c, a - 1.3 * k, l) for l in (1, .9, .8, .7, .5)))

print("\n== 3. Optimal split and gain: variance ratio to real-only at equal budget; breakeven twin price ==")
print("rho     breakeven w=ct/cr    gain at w=0.1   w=0.01   w=0.001   optimal N/n at w=0.01")
for rho in (0.3, 0.5, 0.7, 0.9, 0.94, 0.99):
    print("%.2f    %.4f               %.4f          %.4f   %.4f    %.2f" % (rho, breakeven_price(rho), mf_gain(rho, 0.1), mf_gain(rho, 0.01), mf_gain(rho, 0.001),
          math.sqrt(rho * rho / (0.01 * (1 - rho * rho)))))

print("\n== 4. Simulation of the estimator (bh=1.3, lam=1, T=100; twin costs w=0.02 of a real rollout; budget 20 real-rollout units) ==")
w = 0.02
bh = 1.3
ch = a - bh * k
rho = corr_finite(c, ch, 100)
Ymc, Yhmc = simulate_pairs(a, b, bh, k, 100, 4000, 1.0, seed=3)
var_r = st.pvariance(Ymc)
var_t = st.pvariance(Yhmc)
beta = rho * math.sqrt(var_r / var_t)
print("pilot (4000 pairs): sd real %.5f, sd twin %.5f, rho %.4f (exact %.4f), beta*=%.4f, true J(T=100)=%.5f, twin mean %.5f" % (
    math.sqrt(var_r), math.sqrt(var_t), st.correlation(Ymc, Yhmc), rho, beta, st.mean(Ymc), st.mean(Yhmc)))
B = 20.0
n, N, ratio = best_split(rho, 1.0, w, B)
n_i, N_i = int(round(n)), int(round(N))
print("optimal split: n=%.2f, N=%.1f (N/n=%.1f), predicted variance factor %.4f; rounded n=%d, N=%d" % (n, N, N / n, mf_gain(rho, w), n_i, N_i))
J100 = st.mean(Ymc)
Jt100 = st.mean(Yhmc)
R = 2000
est, real_only, twin_only = [], [], []
rng_seed = 100
for i in range(R):
    Yy, Yyh = simulate_pairs(a, b, bh, k, 100, N_i, 1.0, seed=rng_seed + i)
    est.append(mfmc_trial(Yy, Yyh, n_i, N_i, beta))
    real_only.append(sum(Yy[:int(B)]) / int(B))
    twin_only.append(sum(Yyh) / N_i)
def rep(name, xs):
    m = st.mean(xs); v = st.pvariance(xs)
    print("%-22s mean %.5f (bias %+.5f)  sd %.5f  MSE %.3e" % (name, m, m - J100, math.sqrt(v), v + (m - J100) ** 2))
rep("real only (n=20)", real_only)
rep("twin only (N=%d)" % N_i, twin_only)
rep("control variate", est)
print("empirical variance ratio (cv / real-only) %.4f vs predicted %.4f" % (st.pvariance(est) / st.pvariance(real_only), mf_variance(1, rho, n_i, N_i) * int(B)))

print("\n== 5. Bias-variance budget map (closed form, T=100 per-step average cost, w=0.02): MSE of real-only, twin-only and control variate ==")
T, w = 100, 0.02
print("bh    bias      rho     crossover budget B* (real units)   B=20: real / twin / cv          B=200: real / twin / cv          B=2000: real / twin / cv")
for bh in (1.15, 1.3, 1.6):
    ch = a - bh * k
    rho = corr_long_run(c, ch)
    vr = cost_sd_long_run(c, k) ** 2 / T
    vt = cost_sd_long_run(ch, k) ** 2 / T
    bias = cost(a, bh, k) - J
    Bx = twin_only_crossover(vr, 1.0, vt, w, bias)
    cells = []
    for B in (20, 200, 2000):
        mr = vr / B
        mt = bias ** 2 + vt * w / B
        mc = vr * mf_gain(rho, w) / B
        cells.append("%.1e / %.1e / %.1e" % (mr, mt, mc))
    print("%.2f  %+.4f   %.4f  %10.1f                       %s   %s   %s" % (bh, bias, rho, Bx, *cells))
print("(the control variate is unbiased, so its MSE is its variance; it is lowest in every cell except bh=1.15 at B=20, where the twin-only bias is so small (0.004) that twin-only wins)")
