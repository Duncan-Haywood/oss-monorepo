"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from warmstart_twin import *

print("Cold-start bias of a short twin run: mean of n steps from a default state vs the stationary mean.")

print("\n== 0. AR(1) (marginal variance 1, mean 0) started at x0=a: exact bias / sd vs simulation (phi=0.9, a=3, 20000 runs) ==")
print("n     bias exact   bias sim    sd exact   sd sim     bias/sd   RMSE exact")
rng = random.Random(11)
phi, a, reps = 0.9, 3.0, 20000
for n in (20, 100, 500, 2500):
    ms = [sum(ar1_path_from(phi, n, rng, a)) / n for _ in range(reps)]
    m = sum(ms) / reps
    sd = math.sqrt(sum((x - m) ** 2 for x in ms) / reps)
    be, ve = ar1_start_bias(n, phi, a), ar1_start_var(n, phi)
    print("%-5d %-12.4f %-11.4f %-10.4f %-10.4f %-9.3f %.4f" % (n, be, m, math.sqrt(ve), sd, be / math.sqrt(ve), math.sqrt(be * be + ve)))

print("\n== 1. AR(1): MSE-optimal deletion d* of the first steps of a fixed budget n (exact; a = start error in sd units) ==")
print("phi   a    n      d*     d*/n    MSE(d*)/MSE(0)   bias/sd at d=0")
for phi in (0.5, 0.9, 0.99):
    for a in (1.0, 3.0):
        for n in (100, 1000):
            d, m1, m0 = best_deletion(n, phi, a)
            b = ar1_start_bias(n, phi, a)
            print("%-5g %-4g %-6d %-6d %-7.3f %-16.3f %.3f" % (phi, a, n, d, d / n, m1 / m0, b / math.sqrt(ar1_start_var(n, phi))))

print("\n== 2. How accurate must a warm-start state be? Largest start error (sd units) keeping |bias| <= kappa*sd(run mean) ==")
print("phi   n      kappa=0.1   kappa=0.25   kappa=0.5")
for phi in (0.5, 0.9, 0.99):
    for n in (100, 1000, 10000):
        print("%-5g %-6d %-11.2f %-12.2f %.2f" % (phi, n, ar1_state_tolerance(n, phi, 0.1), ar1_state_tolerance(n, phi, 0.25), ar1_state_tolerance(n, phi, 0.5)))

print("\n== 3. M/M/1 wait started empty: bias constant C = sum_m (E W_inf - E W_m); exact series vs closed form rho/(1-rho)^3 ==")
print("rho   series C           rho/(1-rho)^3     asym var V   n* = C^2/V   relaxation 1/(1-sqrt rho)^2")
for rho in (0.3, 0.5, 0.7, 0.9):
    print("%-5g %-18.9f %-17.9f %-12.1f %-12.2f %.0f" % (rho, mm1_bias_series(rho), mm1_bias_const(rho), mm1_asym_var(rho), mm1_n_star(rho), mm1_relax(rho)))

print("\n== 4. Empty-start bias of the mean of n waits: coupled simulation (same increments, empty vs stationary start) vs -C/n ==")
print("rho   n       predicted -C/n   simulated (paired)   +- se     runs")
rng = random.Random(41)
for rho, n, reps in ((0.5, 100, 20000), (0.7, 300, 6000), (0.9, 3000, 3000), (0.9, 20000, 400)):
    d = []
    for _ in range(reps):
        we, ws = 0.0, mm1_stationary_wait(rho, rng)
        se = ss = 0.0
        for _ in range(n):
            se += we
            ss += ws
            x = rng.expovariate(1.0) - rng.expovariate(rho)
            we = max(0.0, we + x)
            ws = max(0.0, ws + x)
        d.append((se - ss) / n)
    m = sum(d) / reps
    se = math.sqrt(sum((x - m) ** 2 for x in d) / (reps - 1) / reps)
    print("%-5g %-7d %-16.4f %-20.4f %-8.4f %d" % (rho, n, mm1_bias_pred(rho, n), m, se, reps))

print("\n== 5. Short runs, rho=0.9 (true mean wait 9): mean of n waits from five starts (same increments, 6000 runs) ==")
print("starts: empty | at the mean 9 | real-state estimate = stationary real wait + N(0,3^2), clipped at 0 | exact stationary draw | empty + MSER-5 cut")
print("n      start                     bias     sd      RMSE    RMSE/9   mean cut")
rng = random.Random(51)
rho, mu, reps = 0.9, 9.0, 6000
for n in (50, 100, 300, 1000, 3000):
    res = {k: [] for k in ("empty", "mean", "noisy", "stationary", "mser")}
    cuts = []
    for _ in range(reps):
        xs = [rng.expovariate(1.0) - rng.expovariate(rho) for _ in range(n)]
        real = mm1_stationary_wait(rho, rng)
        starts = {"empty": 0.0, "mean": mu, "noisy": max(0.0, real + rng.gauss(0.0, 3.0)), "stationary": real}
        for k, w in starts.items():
            s = 0.0
            for x in xs:
                s += w
                w = max(0.0, w + x)
            res[k].append(s / n)
        w, path = 0.0, []
        for x in xs:
            path.append(w)
            w = max(0.0, w + x)
        c = mser_cut(path)
        cuts.append(c)
        res["mser"].append(sum(path[c:]) / (n - c))
    for k in ("empty", "mean", "noisy", "stationary", "mser"):
        v = res[k]
        m = sum(v) / reps
        sd = math.sqrt(sum((x - m) ** 2 for x in v) / (reps - 1))
        rm = math.sqrt((m - mu) ** 2 + sd * sd)
        print("%-6d %-25s %-8.3f %-7.3f %-7.3f %-8.3f %s" % (n, k, m - mu, sd, rm, rm / mu, "%.0f" % (sum(cuts) / reps) if k == "mser" else "-"))

print("\n== 6. Interval coverage at rho=0.9: batch means (b=30) from an empty start vs stationary start vs empty+MSER-5 (same increments) ==")
print("n       empty cover   stationary cover   empty+MSER cover   predicted bias/sd = (C/n)/sqrt(V/n)   runs")
rng = random.Random(61)
rho, mu = 0.9, 9.0
for n, reps in ((3000, 1500), (10000, 1500), (30000, 1000)):
    c = {"empty": 0, "stat": 0, "mser": 0}
    for _ in range(reps):
        xs = [rng.expovariate(1.0) - rng.expovariate(rho) for _ in range(n)]
        for k, w in (("empty", 0.0), ("stat", mm1_stationary_wait(rho, rng))):
            path = []
            for x in xs:
                path.append(w)
                w = max(0.0, w + x)
            m, h = batch_ci(path, 30)
            c[k] += abs(m - mu) <= h
            if k == "empty":
                cut = mser_cut(path)
                m2, h2 = batch_ci(path[cut:], 30)
                c["mser"] += abs(m2 - mu) <= h2
    print("%-7d %-13.3f %-18.3f %-18.3f %-37.3f %d" % (n, c["empty"] / reps, c["stat"] / reps, c["mser"] / reps,
          (mm1_bias_const(rho) / n) / math.sqrt(mm1_asym_var(rho) / n), reps))
