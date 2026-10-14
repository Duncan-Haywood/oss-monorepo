"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from handover_twin import *

W, C = 1.0, 5.0
MU, SIG = 0.0, 1.2
real = Lognormal(MU, SIG)
M = real.mean()
print("Real human response time: lognormal(mu=%g, sigma=%g), mean %.4f s, median %.3f s. Cost per waiting second w=%g, per abort c=%g." % (MU, SIG, M, math.exp(MU), W, C))
print("J(tau) = w E[min(T,tau)] + c P(T>tau). Corner costs: J(0)=c=%.3f, J(inf)=w E[T]=%.4f." % (C, W * M))

print("\n== 1. Formula checks against direct simulation (400k trials) ==")
for tau in (1.0, 3.0, 9.4):
    print("tau=%-4g closed form %.4f  simulated %.4f" % (tau, cost(real, W, C, tau), simulate_cost(real, W, C, tau, 400000, 1)))
wb = Weibull.with_mean(2.0, M)
print("Weibull k=2 (mean %.3f) tau=3: Simpson %.4f  simulated %.4f" % (wb.mean(), cost(wb, W, C, 3.0), simulate_cost(wb, W, C, 3.0, 400000, 2)))

print("\n== 2. Real optimum and the hazard rule h(tau) = w/c ==")
ts = lognormal_tau_star(MU, SIG, W, C)
tg, jg = best_timeout(real, W, C)
print("hazard root tau* = %.4f, J(tau*) = %.4f;  grid+golden optimum tau=%.4f J=%.4f;  h(tau*)=%.6f vs w/c=%.6f" % (ts, cost(real, W, C, ts), tg, jg, real.hazard(ts), W / C))
print("regret of never aborting: %.4f (%.1f%% of optimum);  of aborting at once: %.4f" % (W * M - jg, 100 * (W * M - jg) / jg, C - jg))

print("\n== 3. Corner policies: twins with monotone hazard (mean matched to the real mean) ==")
print("Each twin's cost is flat to <0.01 beyond ~8-16 s, so its numerical tau is arbitrary inside the plateau; the")
print("last column is the real regret of the corner tau=inf that the twin's shape implies.")
print("twin                      tau_twin   real regret  regret / J*  regret at tau=inf")
twins = [("Exponential", Exponential(M)), ("Weibull k=2", Weibull.with_mean(2.0, M)), ("Weibull k=1.5", Weibull.with_mean(1.5, M))]
for nm, tw in twins:
    tt, tr, reg, jr = twin_policy_regret(real, tw, W, C)
    print("%-24s  %-9s  %.4f       %.1f%%         %.4f" % (nm, "inf" if math.isinf(tt) else "%.2f" % tt, reg, 100 * reg / jr, cost(real, W, C, math.inf) - jr))
print("Twin cost curves J_twin(tau) at tau = 1,2,4,8,16,inf (Weibull: J rises above J(0)=c at first, then falls; no interior minimum):")
for nm, tw in twins:
    print("  %-14s " % nm + "  ".join("%.3f" % cost(tw, W, C, t) for t in (1, 2, 4, 8, 16, math.inf)))

print("\n== 4. Lognormal twin, mean matched, wrong sigma_twin (real sigma=%g) ==" % SIG)
print("sigma_twin  tau_twin  regret     regret / J*")
for st in (0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6):
    tw = Lognormal(math.log(M) - st ** 2 / 2, st)
    tt, tr, reg, jr = twin_policy_regret(real, tw, W, C)
    print("%-10g  %-8s  %.5f    %.2f%%" % (st, "inf" if math.isinf(tt) else "%.2f" % tt, reg, 100 * reg / jr))

print("\n== 5. How much a light-tailed twin costs: regret of never aborting vs sigma and c/(w E[T]) ==")
print("sigma  E[T]    c/(wE[T])  tau*    J*       regret(never abort)  regret/J*")
for sg in (0.8, 1.2, 1.6, 2.0):
    d = Lognormal(0.0, sg)
    for ratio in (1.5, 3.0, 10.0):
        c = ratio * W * d.mean()
        t, j = best_timeout(d, W, c, tmax=2000.0, n=8000)
        print("%-5g  %-6.3f  %-9g  %-6s  %-7.4f  %-19.4f  %.1f%%" % (sg, d.mean(), ratio, "inf" if math.isinf(t) else "%.2f" % t, j, W * d.mean() - j, 100 * (W * d.mean() - j) / j))

print("\n== 6. Real-trial budget: plug-in lognormal MLE (2000 replications per n) ==")
print("Regret of the fitted timeout vs delta-method 0.5 J'' Var(tau_hat); reference: never abort %.4f" % (W * M - jg))
print("n      mean regret  +- se     median regret  delta-method  frac beating never-abort  frac corner")
for n in (10, 20, 50, 100, 200, 500, 1000):
    rng = random.Random(1000 + n)
    regs, corner = [], 0
    for _ in range(2000):
        mu, sg = fit_lognormal([real.sample(rng) for _ in range(n)])
        tau = plugin_timeout(mu, sg, W, C)
        corner += math.isinf(tau) or tau == 0.0
        regs.append(cost(real, W, C, tau) - jg)
    se = statistics.stdev(regs) / math.sqrt(len(regs))
    dm = regret_delta(MU, SIG, W, C, n)[0]
    beat = sum(r < W * M - jg for r in regs) / len(regs)
    print("%-6d %-12.5f %-8.5f %-14.5f %-13.5f %-25.3f %.3f" % (n, statistics.mean(regs), se, statistics.median(regs), dm, beat, corner / len(regs)))
