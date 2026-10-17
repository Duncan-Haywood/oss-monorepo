"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from targeted_observation_twin import *
from targeted_observation_twin.model import draw

n, r, k = 40, 0.05, 3
V = list(range(24, 32))                    # verification region x in [0.6125, 0.7875]
SITES = list(range(0, 20))                 # UAV corridor x in [0.0125, 0.4875] (cannot fly into the storm)
ELL = 0.2                                  # real correlation length
Pr = exp_cov(n, ELL)
L = cholesky(Pr)
base = vtrace(Pr, V)
oracle = plan_and_score(Pr, Pr, V, SITES, r, k)
print("n=%d cells, real field N(0,P_real), Gaussian-shape kernel exp(-(d/ell)^2), ell_real=%.2f, nugget 1e-3, obs noise r=%.2f" % (n, ELL, r))
print("verification region V = cells %d..%d (%d cells), corridor sites = cells %d..%d, k=%d observations, twin-greedy planning" % (V[0], V[-1], len(V), SITES[0], SITES[-1], k))
print("no observation: real verification trace %.3f.  Matched twin (oracle): picks %s, trace after 1/2/3 obs = %s" % (
    base, oracle["picks"], " / ".join("%.3f" % v for v in oracle["real"][1:])))

print("\n== 1. Exactness ==")
print("Monte Carlo (20000 draws) of the closed loop vs the exact Joseph-form trace, twin ell_t, picks = twin-greedy, k=3")
print("ell_t  picks          exact real trace  Monte Carlo   twin-claimed")
for lt in (0.1, 0.3):
    Pt = exp_cov(n, lt)
    o = plan_and_score(Pt, Pr, V, SITES, r, k)
    mc, se = sample_errors(Pt, Pr, V, o["picks"], r, 20000, 7, L)
    print("%.2f   %-14s %.3f             %.3f +- %.3f  %.3f" % (lt, o["picks"], o["real"][-1], mc, se, o["claimed"][-1]))
print("Harm radius d = (ln2/(ell_r^-2 - ell_t^-2))^(1/2) (no nugget, equal variance): per-cell gain ratio K_twin/K_opt crosses 2 near it")
print("ell_t  d_harm(formula)  grid crossing of gain ratio 2 from site 0 (with noise r)   benefit at the cell before -> after")
Pr0 = exp_cov(n, ELL, nugget=0.0)
for lt in (0.25, 0.3, 0.4):
    Pt0 = exp_cov(n, lt, nugget=0.0)
    j = 0
    flips = None
    for i in range(1, n):
        if gain_ratio(Pt0, Pr0, j, i, r) >= 2 and gain_ratio(Pt0, Pr0, j, i - 1, r) < 2:
            flips = i
    d = harm_radius(lt, ELL)
    b0, b1 = cell_benefit(Pt0, Pr0, j, flips - 1, r), cell_benefit(Pt0, Pr0, j, flips, r)
    print("%.2f   %.4f           %.4f .. %.4f (grid step 0.025)                          %+.4f -> %+.4f" % (
        lt, d, (flips - 1 - j) / n, (flips - j) / n, b0, b1))
print("(the benefit 2K P_r[i,j] - K^2 (P_r[j,j]+r) changes sign exactly where the gain ratio equals 2; the closed form ignores r and the crossing is computed with it)")

print("\n== 2. Correlation-length misspecification (twin ell_t, real ell=0.2) ==")
print("ell_t  picks          twin-claimed trace after 1/2/3 obs    REAL trace after 1/2/3 obs      real change vs none after 3")
for lt in (0.05, 0.1, 0.15, 0.2, 0.3, 0.4):
    Pt = exp_cov(n, lt)
    o = plan_and_score(Pt, Pr, V, SITES, r, k)
    print("%.2f   %-14s %-37s %-31s %+.1f%%" % (lt, o["picks"], " / ".join("%.3f" % v for v in o["claimed"][1:]),
          " / ".join("%.3f" % v for v in o["real"][1:]), 100 * (o["real"][-1] / base - 1)))
print("Oracle picks: %s" % oracle["picks"])

print("\n== 3. Amplitude misspecification (twin = c * P_real, correct ell) ==")
print("For ONE observation the per-cell twin/optimal gain ratio is c(s^2+r)/(c s^2+r): at most (s^2+r)/s^2 = %.3f here (s^2=1.001, r=%.2f), never 2 when r < s^2; later observations can still double-count" % ((1.001 + r) / 1.001, r))
print("c      picks          twin-claimed trace after 3   REAL trace after 1/2/3 obs")
for c in (0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 100.0):
    Pt = [[c * v for v in row] for row in Pr]
    o = plan_and_score(Pt, Pr, V, SITES, r, k)
    print("%-6g %-14s %-28.3f %s" % (c, o["picks"], o["claimed"][-1], " / ".join("%.3f" % v for v in o["real"][1:])))

print("\n== 4. Misplaced variance (twin knows ell, has a wrong std-dev profile) ==")
x = grid(n)
def prof(c0):
    return [math.sqrt(0.25 + 2.0 * math.exp(-((xi - c0) / 0.08) ** 2)) for xi in x]
Pr_h = exp_cov(n, ELL, prof(0.40))
base_h = vtrace(Pr_h, V)
orc = plan_and_score(Pr_h, Pr_h, V, SITES, r, k)
print("real error has a hot spot at x=0.40 (std profile sqrt(0.25+2 exp(-((x-c)/0.08)^2))); no obs: %.3f; oracle picks %s -> %s" % (
    base_h, orc["picks"], " / ".join("%.3f" % v for v in orc["real"][1:])))
print("twin hot spot at  picks          claimed after 3   REAL trace after 1/2/3 obs    real change vs none after 3")
for name, Pt in (("x=0.40 (right)", Pr_h), ("none (flat)", exp_cov(n, ELL)), ("x=0.10 (wrong)", exp_cov(n, ELL, prof(0.10))), ("x=0.70 (in V)", exp_cov(n, ELL, prof(0.70)))):
    o = plan_and_score(Pt, Pr_h, V, SITES, r, k)
    print("%-16s %-14s %-17.3f %-30s %+.1f%%" % (name, o["picks"], o["claimed"][-1], " / ".join("%.3f" % v for v in o["real"][1:]), 100 * (o["real"][-1] / base_h - 1)))
Pf = exp_cov(n, ELL)
print("flat twin, first site 19: gain ratio K_twin/K_opt averaged over V = %.2f (helps below 2; second and third observations compound it)" % (
    sum(gain_ratio(Pf, Pr_h, 19, i, r) for i in V) / len(V)))

TR = 100
def ms(v):
    m = sum(v) / len(v)
    return m, math.sqrt(sum((q - m) ** 2 for q in v) / (len(v) - 1) / len(v))

print("\n== 5. Finite-ensemble twin: correct statistics, M members (sample covariance), real ell=0.2 ==")
print("%d independent ensembles per M; 'harm' = fraction of ensembles whose plan leaves the real trace above no-observation (%.3f); +- one s.e. of the mean" % (TR, base))
print("M     untapered: mean real trace after 3 obs   harm     tapered (Gaussian taper c=0.3): mean   harm   claimed (untapered mean)")
T3 = taper(n, 0.3)
for M in (5, 10, 20, 50, 100, 400):
    a, b, cl = [], [], []
    for t in range(TR):
        Pt = ensemble_cov(L, M, 1000 * M + t)
        o = plan_and_score(Pt, Pr, V, SITES, r, k)
        a.append(o["real"][-1]); cl.append(o["claimed"][-1])
        b.append(plan_and_score(ensemble_cov(L, M, 1000 * M + t, T3), Pr, V, SITES, r, k)["real"][-1])
    (ma, sa), (mb, sb) = ms(a), ms(b)
    print("%-5d %.3f +- %.3f                          %3d%%     %.3f +- %.3f                          %3d%%   %.3f" % (
        M, ma, sa, round(100 * sum(v > base for v in a) / TR), mb, sb, round(100 * sum(v > base for v in b) / TR), sum(cl) / TR))
print("(oracle trace after 3 obs: %.3f)" % oracle["real"][-1])

print("\n== 6. Repair: fit the twin's (ell, variance) from m real field realisations (parametric family assumed right) ==")
print("m     ell_hat mean (sd)        mean real trace after 3 obs   harm    (real ell = 0.20)")
for m in (3, 5, 10, 20, 50, 200):
    lh, vals = [], []
    for t in range(TR):
        rng = random.Random(77000 + 1000 * m + t)
        smp = [draw(L, rng) for _ in range(m)]
        eh, s2 = estimate_twin(smp)
        Pt = exp_cov(n, eh, amp=[math.sqrt(s2)] * n)
        lh.append(eh); vals.append(plan_and_score(Pt, Pr, V, SITES, r, k)["real"][-1])
    mh = sum(lh) / TR
    sd = math.sqrt(sum((q - mh) ** 2 for q in lh) / (TR - 1))
    mv, se = ms(vals)
    print("%-5d %.3f (%.3f)             %.3f +- %.3f               %3d%%" % (m, mh, sd, mv, se, round(100 * sum(v > base for v in vals) / TR)))
