"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from selection_twin import *

A, B_, S, R, H = 1.1, 1.0, 0.2, 0.1, 100     # unstable scalar plant x' = a x + b u + w, cost x^2 + r u^2, rollout length
KLO, KHI = 0.5, 1.7                          # candidate gains ~ U[KLO, KHI]  (all stabilising: |a - b k| < 1)
J = lambda k: lq_cost(A, B_, k, S, R)
ms = lambda xs: (statistics.mean(xs), statistics.stdev(xs) / math.sqrt(len(xs)))
f = lambda p: "%.4f +- %.4f" % p

print("Selecting the best of K candidate controllers by simulated cost in a twin (lower cost is better).")
print("Twin scores = true cost + noise.  Gaussian model: mu_i ~ N(m, v^2), s_i = mu_i + N(0, tau^2).")

print("\n== 1. Gaussian model: exact laws vs simulation (m=0, v=1, 20000 rounds; mean +- s.e.) ==")
print("tau   K    claimed th/sim            real th/sim               optimism th/sim         regret th/sim")
rng = random.Random(11)
for tau in (0.5, 1.0, 2.0):
    for K in (2, 10, 100, 1000):
        n = 20000 if K <= 100 else 4000
        rs = [gauss_select(K, 0.0, 1.0, tau, rng) for _ in range(n)]
        t = theory(K, 0.0, 1.0, tau)
        cl, re, orc = (ms([r[j] for r in rs])[0] for j in range(3))
        print("%.1f %5d   %8.4f / %8.4f       %8.4f / %8.4f       %8.4f / %8.4f       %8.4f / %8.4f" % (
            tau, K, t["claimed"], cl, t["real"], re, t["optimism"], re - cl, t["regret"], re - orc))

print("\n== 2. Fixed noise: optimism grows like sqrt(2 ln K) but the winner's real cost only improves (v=1, tau=1) ==")
print("   K     c_K    claimed    real   optimism   sqrt(2 ln K)")
for K in (1, 2, 5, 10, 50, 200, 1000, 10000):
    t = theory(K, 0.0, 1.0, 1.0)
    print("%6d  %.3f  %8.3f  %7.3f  %8.3f   %.3f" % (K, t["c_K"], t["claimed"], t["real"], t["optimism"], math.sqrt(2 * math.log(K))))

print("\n== 3. Fixed simulation budget: tau^2 = sigma2 K / B.  Real cost of the selected winner (m=0, v=1) ==")
for sigma2, B in ((40.0, 10.0), (40.0, 100.0), (40.0, 1000.0)):
    Ks = [1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 30, 50, 100, 300, 1000, 5000]
    cur = budget_curve(Ks, 0.0, 1.0, sigma2, B)
    Kb, vb = best_K(0.0, 1.0, sigma2, B, list(range(1, 400)))
    print("sigma2/B = %.2f:  " % (sigma2 / B) + "  ".join("K=%d:%.3f" % (K, cur[K]) for K in Ks))
    print("     best K = %d (real cost %.3f); K=1 gives %.3f; K=5000 gives %.3f" % (Kb, vb, cur[1], cur[5000]))

print("\n== 4. Concrete twin: exact plant, finite-rollout noise only.  a=%.1f b=%.1f s=%.2f r=%.1f, H=%d, gains ~ U[%.1f,%.1f] ==" % (A, B_, S, R, H, KLO, KHI))
rng = random.Random(21)
pop = [J(rng.uniform(KLO, KHI)) for _ in range(200000)]
m0, v0 = statistics.mean(pop), statistics.pstdev(pop)
sk = sorted(pop)
print("population of true costs: mean %.4f, sd %.4f, median %.4f, min %.4f, 99th pct %.4f  (right-skewed: not Gaussian)" % (m0, v0, sk[len(sk)//2], sk[0], sk[int(0.99*len(sk))]))
N = 10
K = 50
rows = []
for _ in range(300):
    ks = [rng.uniform(KLO, KHI) for _ in range(K)]
    mu = [J(k) for k in ks]
    sc, va = zip(*[rollout_score(A, B_, k, S, R, H, N, rng) for k in ks])
    i = min(range(K), key=sc.__getitem__)
    rows.append((sc[i], mu[i], min(mu), statistics.mean(math.sqrt(x) for x in va), min(math.sqrt(x) for x in va), max(math.sqrt(x) for x in va)))
tau_bar = statistics.mean(r[3] for r in rows)
th = theory(K, m0, v0, tau_bar)
cl, re, orc = (ms([r[j] for r in rows]) for j in range(3))
print("K=%d, N=%d rollouts each (300 rounds).  mean per-candidate score sd tau_hat=%.4f (per-candidate range %.4f..%.4f)" % (K, N, tau_bar, statistics.mean(r[4] for r in rows), statistics.mean(r[5] for r in rows)))
print("                claimed            real (exact)       oracle best        optimism           regret")
print("measured   %s   %s   %s   %.4f              %.4f" % (f(cl), f(re), f(orc), re[0] - cl[0], re[0] - orc[0]))
print("Gaussian th %.4f            %.4f             %.4f             %.4f              %.4f   (using population m, v, tau_hat)" % (th["claimed"], th["real"], th["oracle"], th["optimism"], th["regret"]))
kopt = min((J(KLO + i * (KHI - KLO) / 20000) for i in range(20001)))
print("lowest true cost any gain in [%.1f,%.1f] can achieve (grid): %.4f; the naive winner's mean claim %.4f is %s that" % (KLO, KHI, kopt, cl[0], "below" if cl[0] < kopt else "above"))
print("winner's twin claim is %.1f%% below its real cost" % (100 * (re[0] - cl[0]) / re[0]))

print("\n== 5. Same concrete twin, fixed total budget of 200 rollouts split over K candidates (N = 200/K each) ==")
print("   K    N    claimed           real (exact)      regret vs best-of-K   real cost of best-of-K")
rng = random.Random(31)
for K, N in ((2, 100), (4, 50), (10, 20), (20, 10), (50, 4), (100, 2)):
    rows = []
    for _ in range(400):
        ks = [rng.uniform(KLO, KHI) for _ in range(K)]
        mu = [J(k) for k in ks]
        sc = [rollout_score(A, B_, k, S, R, H, N, rng)[0] for k in ks]
        i = min(range(K), key=sc.__getitem__)
        rows.append((sc[i], mu[i], min(mu)))
    cl, re, orc = (ms([r[j] for r in rows]) for j in range(3))
    print("%4d %4d   %s   %s   %.4f              %.4f" % (K, N, f(cl), f(re), re[0] - orc[0], orc[0]))

print("\n== 6. Repairs at K=50, N=10 rollouts per candidate (equal 500-rollout budget; 400 rounds) ==")
print("naive: argmin twin score; claim = its score.   EB: choose and claim by empirical-Bayes posterior mean (plug-in tau_i^2).")
print("verify-claim: naive winner re-scored on 10 fresh rollouts (budget +10).   screen+verify: 5 rollouts each, top 5 re-scored with 50 each.")
rng = random.Random(41)
acc = {k: [] for k in ("naive", "eb", "vc", "sv")}
K = 50
for _ in range(400):
    ks = [rng.uniform(KLO, KHI) for _ in range(K)]
    mu = [J(k) for k in ks]
    sv = [rollout_score(A, B_, k, S, R, H, 10, rng) for k in ks]
    sc, va = [x[0] for x in sv], [x[1] for x in sv]
    orc = min(mu)
    i = min(range(K), key=sc.__getitem__)
    acc["naive"].append((sc[i], mu[i], orc))
    post, _, _ = eb_posterior(sc, va)
    j = min(range(K), key=post.__getitem__)
    acc["eb"].append((post[j], mu[j], orc))
    acc["vc"].append((rollout_score(A, B_, ks[i], S, R, H, 10, rng)[0], mu[i], orc))
    s1 = [rollout_score(A, B_, k, S, R, H, 5, rng)[0] for k in ks]
    keep = sorted(range(K), key=s1.__getitem__)[:5]
    s2 = {q: rollout_score(A, B_, ks[q], S, R, H, 50, rng)[0] for q in keep}
    q = min(keep, key=s2.__getitem__)
    acc["sv"].append((s2[q], mu[q], orc))
print("method            claim (mean)      real (exact)      claim bias (real-claim)   regret vs best-of-50")
for name, key in (("naive", "naive"), ("EB shrinkage", "eb"), ("verify claim only", "vc"), ("screen+verify", "sv")):
    rs = acc[key]
    cl, re, orc = (ms([r[j] for r in rs]) for j in range(3))
    bias = ms([r[1] - r[0] for r in rs])
    print("%-17s %s   %s   %s        %.4f" % (name, f(cl), f(re), f(bias), re[0] - orc[0]))

print("\n== 7. Gaussian-model screen-and-verify vs naive at equal noise budget (K=100, v=1, tau=1 per unit-budget score) ==")
print("Precision budget: naive spends K units (tau=1 each).  screen+verify: stage 1 spends K/2 (tau1^2=2), stage 2 spends K/2 on the top t (tau2^2 = t/(K/2)).")
rng = random.Random(51)
K = 100
n = 20000
naive = [gauss_select(K, 0.0, 1.0, 1.0, rng) for _ in range(n)]
print("naive               claim %.3f  real %.3f  bias %.3f  regret %.3f" % (ms([r[0] for r in naive])[0], ms([r[1] for r in naive])[0], ms([r[1] - r[0] for r in naive])[0], ms([r[1] - r[2] for r in naive])[0]))
for top in (2, 5, 10, 20):
    # precision budget: naive spends K units (each tau=1).  Stage 1 spends K/2 (tau^2=2); stage 2 spends K/2 over `top` candidates: tau2^2 = top/(K/2)
    t1 = math.sqrt(2.0)
    t2 = math.sqrt(top / (K / 2.0))
    sv = [screen_verify(K, 0.0, 1.0, t1, top, t2, rng) for _ in range(n)]
    print("screen top %2d       claim %.3f  real %.3f  bias %.3f  regret %.3f   (tau1=%.3f tau2=%.3f)" % (
        top, ms([r[0] for r in sv])[0], ms([r[1] for r in sv])[0], ms([r[1] - r[0] for r in sv])[0], ms([r[1] - r[2] for r in sv])[0], t1, t2))
