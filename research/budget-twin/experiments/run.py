"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from budget_twin import *

print("Budget split for an M/M/1 instrument twin (mu=1): fitted from n real interarrival + n real service times, simulated m jobs.")
print("Relative variance of the twin's mean-wait estimate about the REAL mean wait: a(rho)/n + b(rho)/m (delta method).")

print("\n== 0. Simulation-noise coefficient b(rho): m*Var[mean wait]/W^2, Whitt formula vs 600 stationary runs of m=4000 jobs ==")
print("rho   b formula   b simulated   ratio")
rng = random.Random(1)
for rho in (0.5, 0.7):
    m, R = 4000, 600
    xs = [sim_mean(rng, rho, 1.0, m) for _ in range(R)]
    mu_ = sum(xs) / R
    v = sum((x - mu_) ** 2 for x in xs) / R
    bs = v * m / (rho / (1 - rho)) ** 2
    print("%-5g %-11.2f %-13.2f %.3f" % (rho, b_coef(rho), bs, bs / b_coef(rho)))

print("\n== 1. Coefficients and exchange rate ==")
print("rho   a(rho)   b(rho)   b/a (simulated jobs worth one real pair)")
for rho in (0.3, 0.5, 0.7, 0.8, 0.9, 0.95):
    print("%-5g %-8.1f %-8.1f %.3f" % (rho, a_coef(rho), b_coef(rho), exchange_rate(rho)))

print("\n== 2. Optimal split of budget B (real pair = 2 units, simulated job = kappa units): fraction f* on real data ==")
print("rho   kappa   f*      n*(B=1000)  m*(B=1000)   var ratio: 50/50 split   95% on simulation   5% on simulation")
for rho in (0.5, 0.8):
    for kappa in (0.001, 0.01, 0.05, 0.5):
        B = 1000.0
        n, m, f = optimal_split(rho, kappa, B)
        v0 = min_var(rho, kappa, B)
        vg = lambda g: var_total(rho, g * B / 2, (1 - g) * B / kappa) / v0
        print("%-5g %-7g %-7.3f %-11.0f %-12.0f %-24.2f %-19.2f %.2f" % (rho, kappa, f, n, m, vg(0.5), vg(0.05), vg(0.95)))

print("\n== 3. Full pipeline: fit + simulate at fixed budget B=1000, kappa=0.05, rho=0.5 (500 replications; sd of ln of the estimate) ==")
print("f (real share)  n     m      predicted sd   simulated sd   simulated RMSE of ratio est/W   unstable fits")
rng = random.Random(3)
rho, kappa, B, R = 0.5, 0.05, 1000.0, 500
W = rho / (1 - rho)
fstar = optimal_split(rho, kappa, B)[2]
for g in (0.2, 0.5, fstar, 0.95):
    n, m = int(round(g * B / 2)), int(round((1 - g) * B / kappa))
    ls, rs, bad = [], [], 0
    for _ in range(R):
        lh, mh = fit(rng, rho, n)
        if lh >= mh:
            bad += 1
            continue
        e = sim_mean(rng, lh, mh, m)
        ls.append(math.log(e)); rs.append(e / W)
    mm = sum(ls) / len(ls)
    sd = math.sqrt(sum((x - mm) ** 2 for x in ls) / len(ls))
    rmse = math.sqrt(sum((r - 1) ** 2 for r in rs) / len(rs))
    print("%-15.3f %-5d %-6d %-14.3f %-14.3f %-31.3f %d" % (g, n, m, math.sqrt(var_total(rho, n, m)), sd, rmse, bad))

print("\n== 4. Coverage of the real mean wait by 95% intervals as simulation length grows (n fixed; 500 fits each; 10 replications per twin) ==")
print("rho   n     m       V_in/V_sim   naive predicted   naive simulated   aware simulated   unstable fits")
rng = random.Random(4)
R = 500
for rho, n in ((0.5, 200), (0.5, 1000), (0.7, 400)):
    W = rho / (1 - rho)
    for m in (200, 1000, 5000, 20000, 50000):
        cn = ca = used = bad = 0
        for _ in range(R):
            lh, mh = fit(rng, rho, n)
            if lh >= mh:
                bad += 1
                continue
            used += 1
            state = rng.getstate()
            e, h = naive_ci(rng, lh, mh, m)
            cn += abs(e - W) <= h
            rng.setstate(state)  # same simulation output for both intervals
            e, h = aware_ci(rng, lh, mh, n, m)
            ca += abs(e - W) <= h
        r = (a_coef(rho) / n) / (b_coef(rho) / m)
        print("%-5g %-5d %-7d %-12.2f %-17.3f %-17.3f %-17.3f %d" % (rho, n, m, r, naive_coverage(rho, n, m), cn / used, ca / used, bad))
