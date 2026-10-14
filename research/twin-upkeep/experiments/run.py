"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from twin_upkeep import *

a, mu, q, r = 0.9, 1.0, 1.0, 0.1
k = optimal_gain(a, mu)
_, v0 = energy(a, mu, k, 0.0)
J = cost(a, mu, k)
print("plant a=%.1f, b=%.1f, q=%.1f, r=%.1f, s2=1; k*=%.4f; clairvoyant cost J*=%.4f; stable while b < %.3f; info energy at nu=0: v0=E u^2=%.4f" % (a, mu, q, r, k, J, (1 + a) / k, v0))
print("curvature J_kk=%.4f, gain slope dk*/db=%.4f, so regret = %.4f * m" % (cost_curvature(a, mu), gain_slope(a, mu), 0.5 * cost_curvature(a, mu) * gain_slope(a, mu) ** 2))

print("\n== 1. Kalman twin of a drifting gain: closed-form predictive variance and regret vs closed-loop simulation (T=200k, 4 seeds, paired with a clairvoyant run) ==")
print("rho    prior sd   m (formula)  m (sim)   post var   regret (formula)  regret (sim)   twin/prior variance")
for rho in (0.99, 0.999):
    for sd in (0.05, 0.1, 0.15):
        qd = sd * sd * (1 - rho * rho)
        m = pred_var(qd, rho, 1.0, v0)
        ex, e2 = [], []
        for s in range(4):
            c, e, _ = simulate(a, mu, qd, rho, 0.0, 200000, seed=s)
            o, _, _ = simulate(a, mu, qd, rho, 0.0, 200000, seed=s, oracle=True)
            ex.append(c - o); e2.append(e)
        print("%.3f  %.2f       %.5f      %.5f   %.5f    %.5f           %.5f        %.3f" % (rho, sd, m, sum(e2) / 4, post_var(qd, rho, 1.0, v0), regret_rate(a, mu, m), sum(ex) / 4, m / sd ** 2))

print("\n== 2. A random-walk gain (rho=1): the natural closed-loop signal already tracks it ==")
print("qd        m           sd(m)   regret    (regret / J*)   P(step destabilises gain)")
for qd in (1e-6, 1e-5, 1e-4, 1e-3, 1e-2):
    m = pred_var(qd, 1.0, 1.0, v0)
    print("%.0e   %.5f    %.4f  %.5f   %.4f          %.2e" % (qd, m, math.sqrt(m), regret_rate(a, mu, m), regret_rate(a, mu, m) / J, instability_prob(a, mu, math.sqrt(m))))

print("\n== 3. Fresh then frozen: a twin calibrated to posterior variance p0 and never updated (rho=0.99, prior sd 0.1) ==")
rho, qd = 0.99, 0.01 * (1 - 0.99 ** 2)
m = pred_var(qd, rho, 1.0, v0)
p0 = post_var(qd, rho, 1.0, v0)
print("tracking twin regret %.5f (m=%.5f); prior-mean twin regret %.5f (variance %.5f)" % (regret_rate(a, mu, m), m, regret_rate(a, mu, 0.01), 0.01))
print("steps since sync   frozen variance   frozen regret   (tracker regret = %.5f)" % regret_rate(a, mu, m))
for t in (0, 1, 5, 10, 25, 50, 100, 200, 500):
    print("%5d              %.5f           %.5f" % (t, stale_var(t, p0, qd, rho), frozen_rate(a, mu, t, p0, qd, rho)))
half = math.log(0.5) / (2 * math.log(rho))
print("half-life of a frozen twin's advantage over the prior mean: ln(1/2)/(2 ln rho) = %.1f steps" % half)

print("\n== 4. Does a dedicated probing budget pay for one drifting gain?  price gamma of information energy vs its marginal value ==")
print("a     k*     v0      price gamma   value at qd=1e-4 / 1e-3 / 1e-2 (rho=.99)      qd above which dither pays (rho=.99 / rw)")
for a_ in (0.3, 0.9, 1.2):
    k_ = optimal_gain(a_, mu); v_ = energy(a_, mu, k_, 0.0)[1]
    vals = " / ".join("%.5f" % info_value(a_, mu, qd_, 0.99) for qd_ in (1e-4, 1e-3, 1e-2))
    def thr(rho_):
        t = dither_threshold(a_, mu, rho_)
        return ">1 (never)" if t >= 0.999 else "%.3f" % t
    print("%.1f   %.3f  %.3f   %.4f        %-44s  %s / %s" % (a_, k_, v_, info_price(a_, mu), vals, thr(0.99), thr(1.0)))
print("(a stationary drift sd of 0.7/sqrt(1-rho^2) = 5 at the a=0.3 threshold, far outside any small-error regime)")

print("\n== 5. Two drifting parameters (a, b), random walks, common variance q: the closed-loop blind spot ==")
k = optimal_gain(a, mu)
print("mean-field: at nu=0 the covariance has no steady state (blind direction (a,b) ~ (k,1) is unobserved) -> regret grows without bound")
print("q         nu*      nu* / previous (log-log slope in q)   regret at nu*   dither cost   excess*     excess slope")
prev = None
for qq in (1e-10, 1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4):
    nu, e, _ = best_dither2(a, mu, qq, qq, 1.0)
    V, _ = energy(a, mu, k, nu)
    R = regret_rate2(a, mu, pred_cov2(qq, qq, 1.0, V, k, nu))
    sl = "" if prev is None else "%.3f   /  %.3f" % (math.log(nu / prev[0]) / math.log(10), math.log(e / prev[1]) / math.log(10))
    print("%.0e   %.4f   %-30s  %.6f       %.6f      %.6f    " % (qq, nu, sl, R, dither_cost(a, mu, k, nu), e))
    prev = (nu, e)

print("\n== 6. Same model in closed loop (q=2e-7, T=100k, 6 seeds paired with clairvoyant): excess cost of the twin vs excitation nu ==")
qq, T = 2e-7, 100000
nus = best_dither2(a, mu, qq, qq, 1.0)[0]
print("nu*=%.4f (mean-field)" % nus)
print("nu       mean-field regret   sim regret   dither cost   sim total")
for nu in (0.0, 0.003, nus, 0.03, 0.1, 0.3):
    V, _ = energy(a, mu, k, nu)
    P = pred_cov2(qq, qq, 1.0, V, k, nu)
    ex = []
    for s in range(6):
        c, _ = simulate2(a, mu, qq, qq, 1.0, nu, T, seed=s)
        o, _ = simulate2(a, mu, qq, qq, 1.0, nu, T, seed=s, oracle=True)
        ex.append(c - o)
    ms = sum(ex) / 6
    print("%.4f   %-18s  %.5f      %.6f      %.5f" % (nu, "inf" if P is None else "%.5f" % regret_rate2(a, mu, P), ms, dither_cost(a, mu, k, nu), ms + dither_cost(a, mu, k, nu)))

print("\n== 7. Stationary (mean-reverting) two-parameter drift: the blind direction saturates at its prior, dither does not pay ==")
print("rho     prior sd   regret at nu=0   best nu")
for rho in (0.99, 0.999, 0.9999):
    for sd in (0.1, 0.2):
        qq = sd * sd * (1 - rho * rho)
        nu, e, e0 = best_dither2(a, mu, qq, qq, rho)
        print("%.4f  %.2f       %.5f          %.4f" % (rho, sd, e0, nu))
