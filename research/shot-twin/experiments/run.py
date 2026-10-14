"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import random
from shot_twin.model import (log_mean, arith_mean, sqrt_mean, count_threshold, real_error, best_m, twin_error,
                             matched_var, real_error_rule, sample_error)

PAIRS = ((1, 3), (1, 5), (2, 10), (4, 12), (10, 30), (10, 20), (50, 100), (100, 150), (400, 500))

print("Shot-noise twin: real = Poisson(lam) photon counts; twin = Normal(lam, s2), s2 = (lam0+lam1)/2; equal priors")
print("\n== 1. Thresholds t (rule: bright iff K > t) ==")
print("  lam0  lam1   log-mean(exact)  sqrt-twin   arith-twin   arith-log gap")
for a, b in PAIRS:
    print("  %4g  %4g   %9.3f        %8.3f    %8.3f     %7.3f" % (a, b, log_mean(a, b), sqrt_mean(a, b), arith_mean(a, b),
                                                              arith_mean(a, b) - log_mean(a, b)))

print("\n== 2. Exact real error of each rule, and the error the arithmetic twin predicts ==")
print("  lam0  lam1   optimal   sqrt-rule  arith-rule  twin-predicted  twin/optimal  arith/optimal")
for a, b in PAIRS:
    eo = real_error(best_m(a, b), a, b)
    es = real_error_rule(sqrt_mean, a, b)
    ea = real_error_rule(arith_mean, a, b)
    tw = twin_error(a, b, matched_var(a, b))
    print("  %4g  %4g   %.5f   %.5f    %.5f     %.5f        %6.2f        %5.2f" % (a, b, eo, es, ea, tw, tw / eo, ea / eo))

print("\n== 3. Simulation check of exact errors (200000 draws per class, seed 1) ==")
rng = random.Random(1)
for a, b in ((4, 12), (10, 30), (10, 20)):
    m = count_threshold(arith_mean(a, b))
    print("  %g vs %g, arith rule m=%d: exact %.5f  simulated %.5f" % (a, b, m, real_error(m, a, b), sample_error(m, a, b, 200000, rng)))

print("\n== 4. Dark-scene sweep: lam1 = 2 lam0, error of arith rule over optimal ==")
for a in (1, 2, 5, 10, 25, 50, 100, 200):
    b = 2 * a
    print("  lam0=%4g: optimal %.3e  arith %.3e  ratio %.2f  twin-predicted %.3e" % (
        a, real_error(best_m(a, b), a, b), real_error_rule(arith_mean, a, b), real_error_rule(arith_mean, a, b) / real_error(best_m(a, b), a, b),
        twin_error(a, b, matched_var(a, b))))
