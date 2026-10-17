"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from twin_elicitation import *

a, q, r = 0.9, 1.0, 0.1
fmt = lambda x: "inf" if math.isinf(x) else "%.4f" % x
mom = lambda p: (sum(b * w for b, w in zip(*p)), sum(b * b * w for b, w in zip(*p)) - sum(b * w for b, w in zip(*p)) ** 2)

print("plant a=%.1f q=%.1f r=%.1f; posterior on b: N(1, tau^2) truncated at 3 tau; nominal gain k*(1)=%.4f" % (a, q, r, optimal_gain(a, 1.0)))

print("\n== 1. What each payment elicits from a provider whose posterior on b has mean 1 and sd tau ==")
print("tau    var      Brier-paid report   cost-paid gain   cost-paid parameter b_dec   shading b_dec-1   small-var law k")
for tau in (0.05, 0.1, 0.2, 0.3):
    p = truncnorm(1.0, tau)
    m, v = mom(p)
    kb = bayes_gain(a, p)
    print("%.2f   %.4f   %.4f              %.4f           %.4f                      %+.4f            %.4f" % (
        tau, v, m, kb, decision_estimate(a, kb), decision_estimate(a, kb) - m, optimal_gain(a, m) + small_var_shift(a, m, v)))

print("\n== 2. Certainty-equivalent loss: deploying k*(mean report) instead of the Bayes gain ==")
print("tau    excess expected cost   ratio to previous (tau doubles -> ~16 if quartic)   quadratic form (J_kk/2)(dk)^2")
prev = None
for tau in (0.05, 0.1, 0.2, 0.3):
    p = truncnorm(1.0, tau)
    m, v = mom(p)
    ex = ce_excess(a, p)
    dk = small_var_shift(a, m, v)
    h = 1e-3
    jkk = (cost(a, m, optimal_gain(a, m) + h) - 2 * cost(a, m, optimal_gain(a, m)) + cost(a, m, optimal_gain(a, m) - h)) / h ** 2
    print("%.2f   %.3e             %s                                                  %.3e" % (tau, ex, "-" if prev is None else "%.1f" % (ex / prev), jkk / 2 * dk * dk))
    prev = ex

print("\n== 3. Same Brier score, different decisions: true b = 1, provider reports 1-d or 1+d (equal squared error d^2) ==")
print("d     regret if report 1-d   regret if report 1+d   ratio")
for d in (0.1, 0.2, 0.3, 0.5, 0.7):
    lo, hi = regret(a, 1.0, optimal_gain(a, 1 - d)), regret(a, 1.0, optimal_gain(a, 1 + d))
    print("%.1f   %s               %s               %.2f" % (d, fmt(lo), fmt(hi), lo / hi))
print("and the reverse when the plant is really 1+-0.5: regret of report 1-d / 1+d at b=1.5 and b=0.6 (d=0.3)")
for b in (0.6, 1.5, 2.0):
    print("  b=%.1f: %s / %s" % (b, fmt(regret(a, b, optimal_gain(a, 0.7))), fmt(regret(a, b, optimal_gain(a, 1.3)))))

print("\n== 4. Payment cap M when a rare state sits past the cliff: b = 0.6 w.p. 0.99, b = 2.4 w.p. 0.01 ==")
post = ([0.6, 2.4], [0.99, 0.01])
print("Bayes gain without the rare state k*(0.6)=%.4f; the b=2.4 plant is stable only for k < %.4f" % (optimal_gain(a, 0.6), (1 + a) / 2.4))
print("cap M     cost-paid gain   b_dec    expected capped cost")
Ms = cap_threshold(a, 0.6, 2.4, 0.01)
print("closed-form switching cap M* = %.2f" % Ms)
for M in (math.inf, 1e4, 100, 1.05 * Ms, 0.95 * Ms, 10):
    kb = bayes_gain(a, post, M)
    print("%-8s  %.4f          %.4f   %.4f" % ("inf" if math.isinf(M) else "%g" % M, kb, decision_estimate(a, kb), expected_cost(a, post, kb, M)))
print("unbounded (Gaussian) tail: every k>0 has infinite uncapped expected cost, so the uncapped payment elicits nothing")

print("\n== 5. Brier pays a provider for information by variance removed; the twin's decision value is J_bb/2 per unit variance ==")
print("b0    J_bb(b0,k*(b0))   decision value / tau^2 at tau=0.05   at tau=0.2*b0  (Brier value of resolving tau is tau^2 -> ratio 1)")
for b0 in (0.5, 0.8, 1.0, 1.5, 2.0):
    t2 = 0.2 * b0
    print("%.1f   %.3f              %.3f                               %.3f" % (b0, cost_bb(a, b0), info_value(a, b0, 0.05) / 0.05 ** 2, info_value(a, b0, t2) / t2 ** 2))
