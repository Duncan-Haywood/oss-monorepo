"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from autocorr_twin import *

print("One long twin run summarised as mean +- 1.96 s/sqrt(n) (naive) vs 30 batch means with a t quantile.")

print("\n== 0. AR(1) output: exact variance of the run mean vs simulation (n=1000, marginal variance 1, 4000 runs) ==")
print("phi   n*Var exact   n*Var simulated   limit (1+phi)/(1-phi)   ESS   naive cover (known var)   naive cover (s^2)   batch cover (b=30)")
rng = random.Random(11)
n, reps = 1000, 4000
for phi in (0.0, 0.5, 0.9, 0.99):
    ms, cn, cb = [], 0, 0
    for _ in range(reps):
        xs = ar1_path(phi, n, rng)
        m, h = naive_ci(xs)
        ms.append(m)
        cn += abs(m) <= h
        m2, h2 = batch_ci(xs, 30)
        cb += abs(m2) <= h2
    v = sum(m * m for m in ms) / reps
    print("%-5g %-13.3f %-17.3f %-23.3f %-5.0f %-25.3f %-19.3f %.3f" % (
        phi, ar1_inflation(n, phi), n * v, ar1_inflation_limit(phi), ess(n, phi), naive_coverage(n, phi), cn / reps, cb / reps))

print("\n== 1. M/M/1 waiting time (service rate 1): asymptotic variance of the run mean, exact vs long simulation ==")
print("rho   mean   Var(W)   asym var exact   asym var simulated (100 batches)   inflation over iid")
rng = random.Random(21)
for rho, L in ((0.5, 40000), (0.7, 100000), (0.9, 400000)):
    b = 100
    ws = mm1_waits(rho, b * L, rng, burn=20000)
    bm = [sum(ws[i * L:(i + 1) * L]) / L for i in range(b)]
    mb = sum(bm) / b
    v = sum((x - mb) ** 2 for x in bm) / (b - 1) * L
    print("%-5g %-6.3f %-8.3f %-16.1f %-34.1f %.1f" % (rho, mm1_wait_mean(rho), mm1_wait_var(rho), mm1_asym_var(rho), v, mm1_inflation(rho)))

print("\n== 2. Coverage of a 95% interval for the true mean wait from ONE run of n=10000 jobs (1000 runs) ==")
print("rho   true mean   naive cover   batch(30) cover   naive half-width   batch half-width   mean of run means (empty start / 1000 burn)")
rng = random.Random(31)
n, reps, burn = 10000, 1000, 1000
store = {}
for rho in (0.5, 0.7, 0.9):
    tm = mm1_wait_mean(rho)
    cn = cb = 0
    hn = hb = 0.0
    m0 = m1 = 0.0
    runs = []
    for _ in range(reps):
        full = mm1_waits(rho, n + burn, rng)
        xs = full[:n]
        ys = full[burn:]
        m, h = naive_ci(xs)
        cn += abs(m - tm) <= h
        hn += h
        m0 += m
        m2, h2 = batch_ci(ys, 30)
        cb += abs(m2 - tm) <= h2
        hb += h2
        m1 += m2
        runs.append((naive_ci(ys), (m2, h2)))
    store[rho] = runs
    print("%-5g %-11.3f %-13.3f %-17.3f %-18.3f %-18.3f %.3f / %.3f" % (rho, tm, cn / reps, cb / reps, hn / reps, hb / reps, m0 / reps, m1 / reps))

print("\n== 3. False certification: true mean wait 9 (rho=0.9), SLA 8; 'certify' if mean + half-width < 8; n=10000 jobs after 1000 burn (1000 runs) ==")
for name, idx in (("naive", 0), ("batch(30)", 1)):
    c = sum(r[idx][0] + r[idx][1] < 8.0 for r in store[0.9])
    print("%-10s certifies the SLA in %.1f%% of runs" % (name, 100.0 * c / len(store[0.9])))

print("\n== 4. Run length for a half-width of 10% of the mean (95%) ==")
print("rho   naive n (iid)   exact n (asymptotic variance)   ratio")
for rho in (0.5, 0.7, 0.9):
    h = 0.1 * mm1_wait_mean(rho)
    nn, ne = run_length(mm1_wait_var(rho), h), run_length(mm1_asym_var(rho), h)
    print("%-5g %-15.0f %-31.0f %.1f" % (rho, nn, ne, ne / nn))

print("\n== 5. Does the exact run length deliver? rho=0.7, n = exact length, burn 2000, 1000 runs ==")
rho, reps = 0.7, 1000
n = int(run_length(mm1_asym_var(rho), 0.1 * mm1_wait_mean(rho)))
tm = mm1_wait_mean(rho)
rng = random.Random(41)
cn = cb = 0
hb = 0.0
for _ in range(reps):
    xs = mm1_waits(rho, n, rng, burn=2000)
    m, h = naive_ci(xs)
    cn += abs(m - tm) <= h
    m2, h2 = batch_ci(xs, 30)
    cb += abs(m2 - tm) <= h2
    hb += h2
print("n=%d jobs: naive cover %.3f, batch(30) cover %.3f, mean batch half-width %.3f (target %.3f)" % (n, cn / reps, cb / reps, hb / reps, 0.1 * tm))
