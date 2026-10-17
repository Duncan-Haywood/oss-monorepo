"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from retry_twin import *

P = 0.6
RHOS = (0.05, 0.2, 0.5)
print("Skill: pick an object, retry on failure.  Twin: each attempt succeeds independently with p=%.2f.  Real: each object has a latent" % P)
print("success probability ~ Beta(a,b) with the same mean p (so the single-attempt success rate, which a twin is calibrated on, matches)")
print("and intra-object correlation rho = 1/(a+b+1) between two attempts' outcomes.")

print("\n== 1. Real failure after k attempts vs the twin's claim (exact, Beta mixture) ==")
print("rho    (a, b)          k=1      k=3      k=8      k=20     k=50     k=200    tail exponent a")
print("twin   -               " + "  ".join("%.5f" % twin_fail(P, k) for k in (1, 3, 8, 20, 50, 200)))
for r in RHOS:
    a, b = beta_params(P, r)
    print("%-6g (%.2f, %.2f)   %s   %.2f" % (r, a, b, "  ".join("%.5f" % real_fail(a, b, k) for k in (1, 3, 8, 20, 50, 200)), a))

print("\n== 2. Retry budget for a target failure rate delta ==")
print("delta    twin k   " + "   ".join("real k (rho=%g) [asym.]" % r for r in RHOS))
for d in (0.1, 0.01, 0.001, 1e-4):
    kt = twin_budget(P, d)
    cells = []
    for r in RHOS:
        a, b = beta_params(P, r)
        kr = real_budget(a, b, d)
        cells.append("%d (%.1fx) [%.0f]" % (kr, kr / kt, asym_budget(a, b, d)))
    print("%-8g %-8d %s" % (d, kt, "   ".join(cells)))
print("Real failure at the twin's own budget:")
for d in (0.1, 0.01, 0.001, 1e-4):
    kt = twin_budget(P, d)
    cells = ["rho=%g: %.4f (%.0fx claim)" % (r, real_fail(*beta_params(P, r), kt), real_fail(*beta_params(P, r), kt) / twin_fail(P, kt)) for r in RHOS]
    print("  delta=%-8g twin k=%-3d twin claims %.5f;  %s" % (d, kt, twin_fail(P, kt), "; ".join(cells)))

print("\n== 3. Monte Carlo check of the exact failure law (rho=0.2, 200,000 objects, cap 200) ==")
rng = random.Random(11)
a, b = beta_params(P, 0.2)
N = 200000
xs = [sample_attempts(a, b, rng, 200) for _ in range(N)]
print("k    exact       simulated   (se)")
for k in (1, 3, 8, 20, 50, 200):
    ex = real_fail(a, b, k)
    emp = sum(x > k for x in xs) / N
    print("%-4d %.6f    %.6f    %.6f" % (k, ex, emp, math.sqrt(ex * (1 - ex) / N)))

print("\n== 4. Expected attempts with no cap and the give-up rule (payoff w per success, cost c per attempt) ==")
print("Uncapped attempts: twin says 1/p = %.2f.  Real E[attempts up to cap K] = ((a+b-1) - s_K (a+b+K-1))/(a-1); diverges as K^(1-a) when a<1." % (1 / P))
for r in RHOS:
    a, b = beta_params(P, r)
    print("  rho=%-4g a=%.2f: E[attempts] at K=10: %.2f  K=100: %.2f  K=1000: %.2f  K=100000: %.1f" % (r, a, *[expected_attempts(a, b, K) for K in (10, 100, 1000, 100000)]))
print("Twin: attempts are worth making while p*w >= c, forever; real: attempt k+1 after k failures is worth making iff w*a/(a+b+k) >= c.")
print("w/c   rho    real optimal cap K*   real value at K*   real value at the twin's budget k_T(delta=0.01)   regret   twin's claimed value at k_T")
for wc in (4.0, 10.0, 50.0):
    kt = twin_budget(P, 0.01)
    for r in RHOS:
        a, b = beta_params(P, r)
        Ks = best_cap(a, b, wc, 1.0)
        v_star = value(a, b, Ks, wc, 1.0)
        v_t = value(a, b, kt, wc, 1.0)
        print("%-5g %-6g %-21d %-18.3f %-47.3f %.3f (%.1f%%)   %.3f" % (wc, r, Ks, v_star, v_t, v_star - v_t, 100 * (v_star - v_t) / v_star, twin_value(P, kt, wc, 1.0)))

print("\n== 5. Repair: two forced attempts per object in the lab, method of moments on (p, rho), budget for delta=0.01, true rho=0.2 ==")
TR = 0.2
a, b = beta_params(P, TR)
d = 0.01
k_true = real_budget(a, b, d)
print("true budget %d; twin budget %d.  Repeats: 300 per n.  'ok' = real failure at the repaired budget <= delta." % (k_true, twin_budget(P, d)))
print("n objects   median rho_hat  frac rho_hat=0 (independent twin)   median budget [10%, 90%]   mean real failure   frac ok")
rng = random.Random(21)
REP = 300
for n in (25, 100, 400, 1600, 6400):
    ks, fs, ok, zero, rh = [], [], 0, 0, []
    for _ in range(REP):
        ph, rhoh = fit_pair_moments([sample_pair(a, b, rng) for _ in range(n)])
        ph = min(max(ph, 0.05), 0.95)
        kk = repaired_budget(ph, rhoh, d)
        kk = MAXK if kk is None else kk
        f = real_fail(a, b, kk)
        ks.append(kk); fs.append(f); ok += f <= d; zero += rhoh < 1e-9; rh.append(rhoh)
    ks.sort()
    print("%-11d %-15.3f %-35.2f %d [%d, %d]%s %.4f %s %.2f" % (n, statistics.median(rh), zero / REP, ks[REP // 2], ks[REP // 10], ks[9 * REP // 10], " " * 10, statistics.mean(fs), " " * 12, ok / REP))
print("\nOne-attempt-per-object data cannot identify rho: any rho gives the same single-attempt success rate p (the failure law above at k=1 is 0.4 for all rho).")
