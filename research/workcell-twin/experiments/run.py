"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from workcell_twin import *

W, A, N = 64.0, 1.0, 64
KT = argmin_k(lambda k: twin_cost(k, W, A))
print("Workcell: W=%g min of work split over k parallel stations, one arm pays handover a=%g min per branch (serial), makespan = W/k*max(branch)+a*k." % (W, A))
print("Deterministic twin: cost(k)=W/k+a k, optimum k_twin=sqrt(W/a)=%d, promised makespan %.1f min" % (KT, twin_cost(KT, W, A)))

print("\n== 1. Exactness: E[max of k unit-mean Gamma(kappa)] by quadrature vs Monte Carlo (40000 draws) and harmonic numbers ==")
rng = random.Random(1)
print("k  kappa  quadrature  Monte Carlo +- s.e.   H_k (kappa=1)")
for k, kap in ((8, 1.0), (8, 4.0), (8, 0.5), (16, 16.0), (64, 1.0)):
    xs = [max(rng.gammavariate(kap, 1 / kap) for _ in range(k)) for _ in range(40000)]
    m = sum(xs) / len(xs)
    se = (sum((x - m) ** 2 for x in xs) / len(xs) / len(xs)) ** 0.5
    print("%-2d %-6g %.4f      %.4f +- %.4f     %s" % (k, kap, emax(k, kap), m, se, "%.4f" % sum(1 / i for i in range(1, k + 1)) if kap == 1 else "-"))

print("\n== 2. Claim vs delivery at the twin's choice k=%d ==" % KT)
print("Model A (task-level variability: each branch is Gamma(kappa) with mean W/k, CV = kappa^-1/2 whatever k)")
print("kappa  CV     twin claims  real mean  real/claim  P(all branches within their mean)  real 95% quantile  quantile/claim")
for kap in (1, 4, 16, 64):
    rc = real_cost(KT, W, A, kap)
    q = W / KT * quantile_x(KT, kap, 0.95) + A * KT
    print("%-6g %.2f   %.1f         %.2f     %.2fx       %.4f                             %.1f              %.2fx" % (
        kap, kap ** -0.5, twin_cost(KT, W, A), rc, rc / twin_cost(KT, W, A), promise_prob(KT, kap), q, q / twin_cost(KT, W, A)))
print("Model B (chain of N=%d unit steps, each Gamma(1/c^2) mean 1; a branch is N/k steps so its shape is N/(k c^2))" % N)
print("c     branch shape  twin claims  real mean  real/claim  P(all branches within their mean)  real 95% quantile  quantile/claim")
for c in (0.25, 0.5, 1.0, 2.0):
    kap = (N / KT) / c ** 2
    rc = chain_cost(KT, N, c, A)
    q = W / KT * quantile_x(KT, kap, 0.95) + A * KT
    print("%-5g %-13g %.1f         %.2f     %.2fx       %.4f                             %.1f              %.2fx" % (
        c, kap, twin_cost(KT, W, A), rc, rc / twin_cost(KT, W, A), promise_prob(KT, kap), q, q / twin_cost(KT, W, A)))

print("\n== 3. Does the twin buy the right number of stations? ==")
print("Model A: kappa  k_real  regret of k_twin  k_95%-quantile-optimal  regret of k_twin on the 95% quantile")
for kap in (1, 4, 16, 64):
    kr = argmin_k(lambda k: real_cost(k, W, A, kap))
    qc = lambda k: W / k * quantile_x(k, kap, 0.95) + A * k
    kq = argmin_k(qc)
    print("         %-6g %-6d %5.1f%%             %-23d %5.1f%%" % (kap, kr, 100 * regret(KT, W, A, kap), kq, 100 * (qc(KT) / qc(kq) - 1)))
lo, hi = 6.0, 16.0
for _ in range(60):
    mid = (lo + hi) / 2
    lo, hi = (mid, hi) if continuous_condition(mid, W, A) < 0 else (lo, mid)
print("Exponential branches (kappa=1), continuous stationarity (k/k_twin)^2 = H_k - 1 with H_k ~ ln k + gamma: root k=%.2f vs discrete argmin %d" % (lo, argmin_k(lambda k: real_cost(k, W, A, 1))))
print("Model B: c     k_real  regret of k_twin (cost curve is flat: real cost at k=%s)" % ", ".join(str(k) for k in (6, 8, 10)))
for c in (0.25, 0.5, 1.0, 2.0):
    cc = lambda k: chain_cost(k, N, c, A)
    kr = argmin_k(cc, 24)
    print("         %-5g %-6d %5.2f%%   %s" % (c, kr, 100 * (cc(KT) / cc(kr) - 1), ", ".join("%.2f" % cc(k) for k in (6, 8, 10))))

print("\n== 4. Repair: fit kappa from n observed branch durations (moment fit), choose k with the fitted model (Model A, W=%g, a=%g) ==" % (W, A))
tab = EmaxTable(kmax=24)
REPS = 300
print("%d replications per n; regret = real cost at chosen k over real optimum; 'claim err' = fitted-model predicted cost at chosen k over real cost at chosen k - 1" % REPS)
for kap in (1.0, 4.0):
    kr = argmin_k(lambda k: real_cost(k, W, A, kap), 24)
    real = [real_cost(k, W, A, kap) for k in range(1, 25)]
    best = min(real)
    print("true kappa=%g (k_real=%d, twin regret %.1f%%)" % (kap, kr, 100 * (real[KT - 1] / best - 1)))
    print("n     mean kappa_hat (sd)   mean chosen k   mean regret   claim err (deterministic twin: %+.0f%%)" % (100 * (twin_cost(KT, W, A) / real[KT - 1] - 1)))
    for n in (3, 5, 10, 20, 50, 200):
        rr = random.Random(100 + n)
        ks, ch, rg, ce = [], [], [], []
        for _ in range(REPS):
            kh = fit_kappa([rr.gammavariate(kap, 1 / kap) for _ in range(n)])
            kh = max(kh, 0.25)
            k = min(range(1, 25), key=lambda j: W / j * tab(j, kh) + A * j)
            ks.append(kh); ch.append(k); rg.append(real[k - 1] / best - 1)
            ce.append((W / k * tab(k, kh) + A * k) / real[k - 1] - 1)
        mk = sum(ks) / REPS
        sd = (sum((x - mk) ** 2 for x in ks) / (REPS - 1)) ** 0.5
        print("%-5d %.2f (%.2f)          %.1f            %.2f%%        %+.1f%%" % (n, mk, sd, sum(ch) / REPS, 100 * sum(rg) / REPS, 100 * sum(ce) / REPS))

print("\n== 5. Robustness: real branches lognormal with unit mean and CV 1 (Model A shape), twin = gamma fitted from n=50 samples ==")
s2 = math.log(2.0)
LN = lambda r: math.exp(r.gauss(-s2 / 2, math.sqrt(s2)))
for k in (KT, 12):
    m, se = mc_cost(k, W, A, LN, 40000, 11 + k)
    print("k=%-2d real lognormal mean cost %.2f +- %.2f   exponential-branch (kappa=1) prediction %.2f   twin claim %.1f" % (k, m, se, real_cost(k, W, A, 1), twin_cost(k, W, A)))
rr = random.Random(5)
ks = [fit_kappa([LN(rr) for _ in range(50)]) for _ in range(200)]
print("moment-fitted kappa from n=50 lognormal samples: mean %.2f (a gamma with the same CV has kappa=1)" % (sum(ks) / len(ks)))
rl = {k: mc_cost(k, W, A, LN, 20000, 40 + k)[0] for k in range(6, 17)}
kl = min(rl, key=rl.get)
print("lognormal real optimum among k=6..16: k=%d (%.2f); k_twin=8 costs %.2f (%.1f%% over)" % (kl, rl[kl], rl[8], 100 * (rl[8] / rl[kl] - 1)))
