"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from rendezvous_twin import *

C, LAM, S2, EPS = 50.0, 1.0, 1.0, 3.0
TT = twin_interval(C, LAM, S2)
print("Team: error variance since last rendezvous V(t)=s2 t + b2 t^2 (s2=%g white, b2 = variance of a per-run bias rate)." % S2)
print("Rendezvous costs c=%g, error costs lam=%g per unit mean variance. Twin fitted on short-horizon increments sees b2=0." % (C, LAM))
print("Twin cost-optimal interval sqrt(2c/(lam s2)) = %.2f; twin error-budget interval eps^2/s2 = %.2f (eps=%g)" % (TT, budget_interval_twin(EPS, S2), EPS))

print("\n== 1. Variance law by Monte Carlo (40000 runs; bias rate ~ N(0,b2), t iid N(0,s2) steps) ==")
rng = random.Random(1)
print("t   b2    law V(t)   Monte Carlo +- s.e.")
for t, b2 in ((1, 0.1), (5, 0.1), (10, 0.1), (10, 0.3), (20, 0.03)):
    m, se = simulate_V(t, S2, b2, 40000, rng)
    print("%-3d %-5g %.3f      %.3f +- %.3f" % (t, b2, V(t, S2, b2), m, se))

print("\n== 2. Cost-rate planning: twin interval %.1f vs real optimum ==" % TT)
print("rho=b2*T_twin/s2  b2     real T*  T*/T_twin  peak-std claim  real peak std at T_twin  ratio  regret of twin interval  real cost rate at T_twin/at T*")
for rho in (0.1, 0.3, 1.0, 3.0):
    b2 = rho * S2 / TT
    ts = real_interval(C, LAM, S2, b2)
    print("%-17g %-6g %-8.2f %-10.3f %-15.2f %-24.2f %-6.3f %-24s %.2f / %.2f" % (
        rho, b2, ts, ts / TT, math.sqrt(S2 * TT), math.sqrt(V(TT, S2, b2)), peak_ratio(TT, S2, b2),
        '%.2f%%' % (100 * regret(TT, C, LAM, S2, b2)), cost_rate(TT, C, LAM, S2, b2), cost_rate(ts, C, LAM, S2, b2)))
print("Rendezvous counts per 1000 time units:")
for rho in (0.1, 0.3, 1.0, 3.0):
    b2 = rho * S2 / TT
    print("  rho=%-4g twin %.0f rendezvous, real optimum %.0f (%.2fx)" % (rho, 1000 / TT, 1000 / real_interval(C, LAM, S2, b2), TT / real_interval(C, LAM, S2, b2)))

print("\n== 3. Error-budget planning: keep peak error std <= eps=%g ==" % EPS)
tb = budget_interval_twin(EPS, S2)
print("b2     twin interval  real interval  real/twin  real peak std at twin interval  fraction of each cycle over budget")
for b2 in (0.01, 0.03, 0.1, 0.3):
    tr = budget_interval_real(EPS, S2, b2)
    print("%-6g %-14.2f %-14.2f %-10.3f %-31.2f %.3f" % (b2, tb, tr, tr / tb, math.sqrt(V(tb, S2, b2)), violation_fraction(tb, EPS, S2, b2)))

print("\n== 4. Pairwise relative frame (map merging needs relative error): V_rel(t)=2 s2 t + 2(1-kappa) b2 t^2, b2=0.1 ==")
b2 = 0.1
rng = random.Random(4)
print("kappa  b2_rel   Monte Carlo check of V_rel(10) (30000 pairs)      cost-optimal T*  T*/twin  twin regret")
tt2 = twin_interval(C, LAM, 2 * S2)
for kap in (0.0, 0.5, 0.9, 1.0):
    n, t, xs = 30000, 10, []
    for _ in range(n):
        z, u1, u2 = (rng.gauss(0, 1) for _ in range(3))
        b_1 = math.sqrt(b2) * (math.sqrt(kap) * z + math.sqrt(1 - kap) * u1)
        b_2 = math.sqrt(b2) * (math.sqrt(kap) * z + math.sqrt(1 - kap) * u2)
        e = sum(rng.gauss(0, 1) - rng.gauss(0, 1) for _ in range(t)) + (b_1 - b_2) * t
        xs.append(e * e)
    m = sum(xs) / n
    se = math.sqrt(sum((x - m) ** 2 for x in xs) / n / n)
    br = relative_b2(b2, kap)
    ts = real_interval(C, LAM, 2 * S2, br)
    print("%-6g %-8.3f law %.2f, MC %.2f +- %.2f                         %-16.2f %-9.3f %.2f%%" % (
        kap, br, pair_V(t, S2, b2, kap), m, se, ts, ts / tt2, 100 * regret(tt2, C, LAM, 2 * S2, br)))
print("(twin interval for the relative frame: %.2f)" % tt2)

print("\n== 5. Repair: fit (s2,b2) from n runs with ground-truth error at lags 1 and L, then plan (400 replications) ==")
def fit_regret(b2, n, L, rng):
    s_, l_ = 0.0, 0.0
    sh = sl = 0.0
    for _ in range(n):
        b = rng.gauss(0, math.sqrt(b2))
        e = 0.0
        for k in range(1, L + 1):
            e += rng.gauss(0, 1)
            if k == 1:
                sh += (e + b) ** 2
        sl += (e + b * L) ** 2
    s2h, b2h = fit_two_lag(sh / n, 1, sl / n, L)
    T = real_interval(C, LAM, s2h, b2h)
    return regret(T, C, LAM, S2, b2), b2h
b2 = 0.1
print("true b2=%g (rho=1); twin regret %.2f%%; a short-lag-only fit is the twin" % (b2, 100 * regret(TT, C, LAM, S2, b2)))
print("L   n    mean regret  95th pct regret  mean b2_hat  sd b2_hat")
for L in (5, 10):
    for n in (3, 5, 10, 20, 50, 200):
        rng = random.Random(100 * L + n)
        rs, bs = zip(*[fit_regret(b2, n, L, rng) for _ in range(400)])
        mb = sum(bs) / len(bs)
        sd = math.sqrt(sum((x - mb) ** 2 for x in bs) / len(bs))
        q = sorted(rs)[int(0.95 * len(rs)) - 1]
        print("%-3d %-4d %-12s %-15s %-12.3f %.3f" % (L, n, "%.3f%%" % (100 * sum(rs) / len(rs)), "%.3f%%" % (100 * q), mb, sd))
