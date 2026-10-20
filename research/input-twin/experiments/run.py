"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from input_twin import *

print("Input uncertainty of a twin fitted to n real interarrival and n real service times (M/M/1 instrument, mu=1, true wait rho/(1-rho)).")
print("The twin is simulated for ever: its wait is the number wq(lam_hat, mu_hat), so all of its error is input error.")

print("\n== 0. Delta-method relative sd of the twin's wait vs simulation of the fitted twin (4000 fits, sd of ln W) ==")
print("rho   n      delta sd   simulated sd   ratio")
rng = random.Random(1)
for rho, n in ((0.5, 200), (0.5, 2000), (0.8, 2000), (0.9, 2000), (0.9, 20000)):
    ws = [math.log(w) for w in (wq(*fit(rng, rho, n)) for _ in range(4000)) if w < math.inf]  # unstable fits excluded
    m = sum(ws) / len(ws)
    sd = math.sqrt(sum((w - m) ** 2 for w in ws) / len(ws))
    print("%-5g %-6d %-10.4f %-14.4f %.3f" % (rho, n, rel_sd(rho, n), sd, sd / rel_sd(rho, n)))

print("\n== 1. Real observations per stream needed for a 10% (resp. 5%) relative sd of the twin's wait (delta method) ==")
print("rho   n(10%)   n(5%)")
for rho in (0.5, 0.7, 0.8, 0.9, 0.95):
    print("%-5g %-8.0f %.0f" % (rho, n_required(rho, 0.10), n_required(rho, 0.05)))

print("\n== 2. P(fitted twin is unstable, lam_hat >= mu_hat): exact vs simulation (20000 fits) ==")
print("rho   n     exact        simulated")
rng = random.Random(2)
for rho in (0.8, 0.9, 0.95):
    for n in (20, 50, 200):
        reps = 20000
        hits = 0
        for _ in range(reps):
            lh, mh = fit(rng, rho, n)
            hits += lh >= mh
        print("%-5g %-5d %-12.5f %.5f" % (rho, n, p_unstable(rho, n), hits / reps))

print("\n== 3. Accuracy of the point twin (4000 fits): median Wtwin/Wtrue, P(within 10%), P(twin unstable) ==")
print("rho   n      median ratio   P(|err|<=10%)   P(unstable)")
rng = random.Random(3)
for rho in (0.5, 0.8, 0.9):
    for n in (100, 1000, 10000):
        true = rho / (1 - rho)
        rs = sorted(wq(*fit(rng, rho, n)) / true for _ in range(4000))
        print("%-5g %-6d %-14.3f %-15.3f %.4f" % (rho, n, rs[len(rs) // 2], sum(abs(r - 1) <= 0.1 for r in rs) / len(rs), p_unstable(rho, n)))

print("\n== 4. SLA certification: certify if the twin's wait (or an upper 95% bound) is <= S.  Real wait = 1.1 S (violating) or 0.7 S (compliant) ==")
print("rho   n     rule        false certification (real=1.1S)   power (real=0.7S)")
rng = random.Random(4)
REPS = 1500
for rho in (0.8, 0.9):
    true = rho / (1 - rho)
    for n in (200, 1000):
        for name in ("point", "delta", "bootstrap", "posterior"):
            out = {}
            for tag, S in (("viol", true / 1.1), ("ok", true / 0.7)):
                cert = 0
                for _ in range(REPS):
                    a = [rng.expovariate(rho) for _ in range(n)]
                    s = [rng.expovariate(1.0) for _ in range(n)]
                    lh, mh = n / sum(a), n / sum(s)
                    if name == "point":
                        b = wq(lh, mh)
                    elif name == "delta":
                        b = delta_bound(lh, mh, n, n)
                    elif name == "bootstrap":
                        b = boot_bound(rng, lh, mh, n, n, B=200)
                    else:
                        b = post_bound(rng, sum(a), sum(s), n, n, B=200)
                    cert += b <= S
                out[tag] = cert / REPS
            print("%-5g %-5d %-11s %-33.3f %.3f" % (rho, n, name, out["viol"], out["ok"]))

print("\n== 5. Coverage of the upper 95% bound on the real wait (1500 fits each); nominal 0.95 ==")
print("rho   n     delta    bootstrap  posterior")
rng = random.Random(5)
for rho in (0.5, 0.8, 0.9):
    true = rho / (1 - rho)
    for n in (50, 200, 1000):
        c = [0, 0, 0]
        for _ in range(REPS):
            a = [rng.expovariate(rho) for _ in range(n)]
            s = [rng.expovariate(1.0) for _ in range(n)]
            lh, mh = n / sum(a), n / sum(s)
            bs = (delta_bound(lh, mh, n, n), boot_bound(rng, lh, mh, n, n, B=200), post_bound(rng, sum(a), sum(s), n, n, B=200))
            for i, b in enumerate(bs):
                c[i] += b >= true
        print("%-5g %-5d %-8.3f %-10.3f %.3f" % (rho, n, c[0] / REPS, c[1] / REPS, c[2] / REPS))
