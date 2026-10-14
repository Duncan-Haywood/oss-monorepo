import os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from math import exp
from expert_pooling import *

S2 = 2.0
print("E1: closed form a*=n/(1+(n-1)rho) vs numerical argmin of exact expected log-loss (s2=%g)" % S2)
print("%3s %5s %9s %9s %10s %10s" % ("n", "rho", "a*", "argmin", "bayes", "single"))
single = expected_logloss(1.0, 1, 0.0, S2)
for n in (2, 5, 10):
    for rho in (0.0, 0.2, 0.5, 0.8):
        print("%3d %5.2f %9.4f %9.4f %10.5f %10.5f" % (n, rho, a_star(n, rho), best_exponent(n, rho, S2),
                                                        bayes_logloss(n, rho, S2), single))

print("\nE2: saturation. Bayes log-loss vs n, and loss gain over one expert (rho=0.2, s2=%g); limit n_eff -> 1/rho=5" % S2)
for n in (1, 2, 5, 10, 50, 1000):
    print("n=%4d n_eff=%6.3f bayes=%.5f  gain=%.5f" % (n, n_eff(n, 0.2), bayes_logloss(n, 0.2, S2),
                                                     single - bayes_logloss(n, 0.2, S2)))

print("\nE3: pooling rules, Monte Carlo (n=8, T=40000, s2=%g): mean log-loss" % S2)
print("%5s %9s %9s %9s %9s %9s" % ("rho", "linear", "geo a=1", "sum a=n", "a=a*", "bayes"))
n = 8
for rho in (0.0, 0.3, 0.6, 0.9):
    data = sample_logits(n, rho, S2, 40000, random.Random(7))
    lin = empirical_pool_loss(data, lambda ls: sum(sigmoid(l) for l in ls) / n)
    row = [lin]
    for a in (1.0, float(n), a_star(n, rho)):
        row.append(empirical_pool_loss(data, lambda ls, a=a: sigmoid(a * sum(ls) / n)))
    print("%5.2f %9.4f %9.4f %9.4f %9.4f %9.4f" % (rho, *row, bayes_logloss(n, rho, S2)))

print("\nE4: robustness to misspecified extremization (n=8, rho=0.3): excess loss at a = k*a*")
n, rho = 8, 0.3
b = bayes_logloss(n, rho, S2)
for k in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0):
    print("k=%.2f a=%6.3f excess=%.5f" % (k, k * a_star(n, rho), expected_logloss(k * a_star(n, rho), n, rho, S2) - b))

print("\nE5: n*rho assumed 0 when true rho>0 (naive independence a=n) vs ignoring extremization (a=1)")
for rho in (0.05, 0.1, 0.2, 0.4):
    n = 8
    b = bayes_logloss(n, rho, S2)
    print("rho=%.2f a*=%.3f  excess a=n: %.5f   excess a=1: %.5f" % (
        rho, a_star(n, rho), expected_logloss(n, n, rho, S2) - b, expected_logloss(1.0, n, rho, S2) - b))

print("\nE6: estimating rho from labelled logits (n=5, s2=%g): estimate vs T" % S2)
for T in (100, 1000, 10000):
    est = [estimate_rho(sample_logits(5, 0.4, S2, T, random.Random(s))) for s in range(20)]
    mu = sum(est) / len(est); sd = (sum((e - mu) ** 2 for e in est) / len(est)) ** .5
    print("T=%6d mean=%.3f sd=%.3f" % (T, mu, sd))

print("\nE7: online gradient descent on a (n=5, rho=0.4, a*=%.3f): average regret vs best fixed a" % a_star(5, 0.4))
n, rho = 5, 0.4
data = sample_logits(n, rho, S2, 100000, random.Random(11))
path, losses = ogd_exponent(data, n)
astar = a_star(n, rho)
best = [logloss(y * astar * sum(ls) / n) for y, ls in data]
for T in (100, 1000, 10000, 100000):
    print("T=%6d a_T=%.3f avg regret=%.5f" % (T, path[T - 1], (sum(losses[:T]) - sum(best[:T])) / T))
