"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from smooth_twin import *

print("Task (normalised): real reward R*1{theta>=0} - c(theta+m)^2 with R=%g, c=%g, m=%g; nominal pose -m; real optimum theta=0, value %.3f." % (R, C, M, real_opt()))
print("Twin: edge replaced by a logistic of width tau (twin objective R*sigmoid((theta-e)/tau) - c(theta+m)^2); e = twin edge error (0 unless stated).")
print("Real gradient at the nominal pose is 0 (hard edge): plain ascent on the real plant stays at -m with regret %.3f." % real_regret(-M))

print("\n== 0. Checks: twin optimum vs brute-force grid, and the small-tau law theta ~ tau ln(R/(2cm tau)) ==")
print("tau    optimum (root)   brute-force argmax   asymptote   asymptote/optimum")
for tau in (0.02, 0.05, 0.1, 0.15, 0.2):
    t = twin_optimum(tau)
    lo, hi = -0.6, 0.5
    n = 400000
    best = max(range(n + 1), key=lambda i: twin_value(lo + (hi - lo) * i / n, tau))
    print("%-6g %.6f         %.6f             %.6f    %.3f" % (tau, t, lo + (hi - lo) * best / n, overshoot_asymptote(tau), overshoot_asymptote(tau) / t))

print("\n== 1. Twin optimum, real regret and trainability by gradient ascent from the nominal pose (eta=0.02) ==")
tc, tu = trap_threshold(), upper_threshold()
print("trap threshold tau_c (below it the twin objective has two local maxima) = %.4f" % tc)
print("upper threshold tau_u (above it the twin optimum lies below the real edge)  = %.4f" % tu)
print("tau     #local max   twin optimum   real regret   ascent from -m: theta   steps    reaches optimum?")
for tau in (0.02, 0.05, 0.1, 0.11, 0.12, 0.15, 0.2, 0.24, 0.26, 0.3, 0.5):
    t = twin_optimum(tau)
    th, k, ok = gd(tau, eta=0.02, steps=400000)
    print("%-7g %-12d %-14.4f %-13.4f %-23.4f %-8d %s" % (tau, n_local_maxima(tau), t, real_regret(t), th, k, "yes" if abs(th - t) < 1e-3 else "NO (trapped)"))

print("\n== 2. Annealing tau geometrically (40 stages, warm-started ascent from -m), start tau=0.2 ==")
print("final tau   final theta   real regret   (fixed-tau ascent regret at that tau)")
for t1 in (0.1, 0.05, 0.02, 0.01):
    th = anneal(0.2, t1)
    thf, _, _ = gd(t1, eta=0.02, steps=400000)
    print("%-11g %-13.4f %-13.4f %.4f" % (t1, th, real_regret(th), real_regret(thf)))

print("\n== 3. Real-plant exploration without a twin: expected evaluations until a Gaussian perturbation of std s around the nominal pose first crosses the edge ==")
for s in (0.1, 0.2, 0.5):
    p = 0.5 * math.erfc((M / s) / math.sqrt(2))
    print("s=%.1f  P(success per evaluation)=%.2e  expected evaluations=%.3g" % (s, p, 1 / p))

print("\n== 4. Smoothing as a safety margin: twin edge at 0 (known to the twin), real edge at eps ~ N(0, s^2) (unknown) ==")
print("The twin's optimum pose theta_hat(tau) is one number per tau; E[real regret] of a fixed pose is by quadrature over eps.")
peak = max((twin_optimum(0.05 + 0.005 * k), 0.05 + 0.005 * k) for k in range(0, 41))
print("largest pose reachable by any tau: theta_hat=%.4f at tau=%.3f (tau_c=%.4f, so all poses above ~%.3f need a trapped tau... check below)" % (peak[0], peak[1], tc, twin_optimum(tc)))
taus = [tc + 0.005 * k for k in range(0, 30) if tc + 0.005 * k <= tu]
for s in (0.02, 0.05, 0.1, 0.2):
    th_star, v_star = best_pose(s)
    tv = [(exp_regret(twin_optimum(t), s), t) for t in taus]
    vt, tb = min(tv)
    vh = exp_regret(twin_optimum(0.02), s)
    print("\ns=%g:  hard twin (pose 0)  E[regret]=%.4f;  never leave nominal: %.4f" % (s, exp_regret(0.0, s), exp_regret(-M, s)))
    print("  Bayes-best explicit pose theta*=%.3f  E[regret]=%.4f" % (th_star, v_star))
    print("  best trainable smoothing (tau in [tau_c, tau_u]): tau=%.3f  pose=%.4f  E[regret]=%.4f  (excess over Bayes-best %.4f)" % (tb, twin_optimum(tb), vt, vt - v_star))
    print("  smallest-tau annealed end-point (tau=0.02): pose=%.4f  E[regret]=%.4f" % (twin_optimum(0.02), vh))
