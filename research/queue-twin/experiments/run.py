"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from queue_twin import *

W = 2.0  # SLA: mean wait <= 2 mean service times
print("Shared instrument, Poisson arrivals, one FIFO server. Time unit = mean service time (same in twin and real).")
print("Twin: exponential service (c2=1).  Real: lognormal service with squared CV c2 (or Pareto), same mean.")

print("\n== 0. Pollaczek-Khinchine vs Lindley simulation (lognormal service, 1.5e6 jobs, 5,000 burn-in) ==")
print("c2   rho   PK mean wait   simulated (+- se, 20 contiguous batches)")
rng = random.Random(7)
for c2, rho in ((1.0, 0.7), (4.0, 0.5), (4.0, 0.7), (9.0, 0.5)):
    ws = lindley(rho, lambda r: sample_lognormal(r, c2), 1500000, rng, burn=5000)
    L = len(ws) // 20
    bs = [sum(ws[i * L:(i + 1) * L]) / L for i in range(20)]
    print("%-4g %.1f   %.4f         %.4f +- %.4f" % (c2, rho, pk_wait(rho, c2), sum(ws) / len(ws), statistics.stdev(bs) / math.sqrt(20)))

print("\n== 1. Load admitted at mean wait <= %g service times ==" % W)
rt = admissible_rho(W, 1.0)
print("twin (c2=1) admits rho=%.4f" % rt)
print("c2    real rho*   twin overload (rho_twin/rho*)   real mean wait at twin load   (x claim)")
for c2 in (0.0, 0.5, 2.0, 4.0, 9.0, 25.0):
    rr = admissible_rho(W, c2)
    print("%-5g %.4f      %.3f                          %.3f                          %.2f" % (c2, rr, rt / rr, pk_wait(rt, c2), pk_wait(rt, c2) / W))

print("\n== 2. 99th-percentile wait at the twin's admitted load (lognormal, 3e6 jobs) ==")
rho = rt
t99 = math.log(rho / 0.01) / (1 - rho)
print("twin (exponential) claims P99 wait = %.2f service times; P(W > t99) = %.4f" % (t99, exp_tail(rho, t99)))
rng = random.Random(21)
for c2 in (4.0, 9.0):
    ws = sorted(lindley(rho, lambda r: sample_lognormal(r, c2), 3000000, rng, burn=5000))
    emp = sum(w > t99 for w in ws) / len(ws)
    print("real c2=%g: P(W > twin's t99) = %.4f (%.1fx claim); real P99 = %.2f (%.2fx claim); mean %.3f (PK %.3f)" % (
        c2, emp, emp / 0.01, ws[int(0.99 * len(ws))], ws[int(0.99 * len(ws))] / t99, sum(ws) / len(ws), pk_wait(rho, c2)))

print("\n== 3. Infinite-variance service (Pareto): the twin's finite mean wait has no real counterpart ==")
rho = 0.5
print("twin claim at rho=0.5: mean wait %.3f" % wait_exp(rho))
print("alpha  c2      mean wait after n jobs (median of 5 seeds)")
for alpha in (3.0, 2.5, 1.8, 1.5):
    c2 = pareto_moments(alpha)[1]
    row = []
    for n in (10 ** 4, 10 ** 5, 10 ** 6):
        vals = []
        for seed in range(5):
            r = random.Random(100 * seed + int(alpha * 10))
            ws = lindley(rho, lambda q: sample_pareto(q, alpha), n, r, burn=0)
            vals.append(sum(ws) / len(ws))
        row.append("n=1e%d: %.2f" % (round(math.log10(n)), statistics.median(vals)))
    print("%-5g  %-7s %s   PK: %s" % (alpha, "inf" if c2 == math.inf else "%.3f" % c2, "  ".join(row),
                                     "inf" if c2 == math.inf else "%.2f" % pk_wait(rho, c2)))

print("\n== 4. Repair: fit c2 from n logged real service times (lognormal c2=4, SLA mean wait <= %g) ==" % W)
c2t = 4.0
rstar = admissible_rho(W, c2t)
print("true admissible rho* = %.4f; twin admits %.4f (real wait %.2f = %.2fx SLA)" % (rstar, rt, pk_wait(rt, c2t), pk_wait(rt, c2t) / W))
print("n      | plug-in: median c2_hat  median rho_hat  P(real wait > SLA)  mean wait/SLA | bootstrap-90% upper c2: P(violate)  mean rho* - rho_used")
rng = random.Random(5)
REP, B = 400, 100
for n in (25, 100, 400, 1600):
    c2h, viol, wr, viol_u, lost_u = [], 0, [], 0, []
    for _ in range(REP):
        xs = [sample_lognormal(rng, c2t) for _ in range(n)]
        c = fit_c2(xs)
        c2h.append(c)
        rh = rho_from_c2(W, c)
        wv = pk_wait(rh, c2t)
        viol += wv > W
        wr.append(wv / W)
        bs = sorted(fit_c2([rng.choice(xs) for _ in range(n)]) for _ in range(B))
        ru = rho_from_c2(W, bs[int(0.9 * B)])
        viol_u += pk_wait(ru, c2t) > W
        lost_u.append(rstar - ru)
    print("%-6d | %.2f            %.4f          %.3f               %.3f         | %.3f                              %.4f" % (
        n, statistics.median(c2h), rho_from_c2(W, statistics.median(c2h)), viol / REP, statistics.mean(wr), viol_u / REP, statistics.mean(lost_u)))
