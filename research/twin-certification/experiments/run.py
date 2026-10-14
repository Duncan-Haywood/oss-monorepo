"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import random
from twin_certification import *

EPS, DELTA = 0.01, 0.05
NSIM, F = 20000, 2          # the twin: 2 failures in 20000 rollouts, i.e. it claims p = 1e-4 = eps/100
print("Certify p < eps = %g at delta = %g from n real trials. Rule: certify iff k <= c." % (EPS, DELTA))
print("Twin data: %d failures in %d rollouts (claims p = %g); prior a = 1/2 + w f, b = 1/2 + w (N - f), w = weight of a twin rollout in real trials." % (F, NSIM, F / NSIM))

print("\n== 1. Checks ==")
n0 = n_zero_freq(EPS, DELTA)
print("exact zero-failure n = ceil(ln delta / ln(1-eps)) = %d;  c_freq(n0)=%d, c_freq(n0-1)=%d" % (n0, c_freq(n0, EPS, DELTA), c_freq(n0 - 1, EPS, DELTA)))
rng = random.Random(7)
n, c = 400, 2
sim = sum(sum(rng.random() < EPS for _ in range(n)) <= c for _ in range(20000)) / 20000
print("size of (n=400, c=2) at p=eps: exact %.4f, simulated %.4f (20000 runs)" % (false_cert(n, c, EPS), sim))
a, b = power_prior(F, NSIM, 0.01)
c = c_bayes(300, a, b, EPS, DELTA)
print("power prior w=0.01, n=300, c=%d: prior-averaged P(certify and p>=eps) = %.4f (<= delta by construction)" % (c, prior_false_cert(300, c, a, b, EPS)))

print("\n== 2. Zero-failure sample size and the worst-case size at that n ==")
print("rule                       n      size at p=eps   (n=0 means the prior certifies with no real data)")
rows = [("exact (Clopper-Pearson)", None), ("uniform Beta(1,1)", (1, 1)), ("Jeffreys Beta(.5,.5)", (.5, .5))]
rows += [("twin w=%g" % w, power_prior(F, NSIM, w)) for w in (0.001, 0.003, 0.01, 0.03)]
for nm, ab in rows:
    n = n0 if ab is None else n_zero_bayes(ab[0], ab[1], EPS, DELTA)
    print("%-26s %-6d %.4f" % (nm, n, false_cert(n, 0, EPS)))

print("\n== 3. Thresholds and sizes at fixed n ==")
print("n     rule                     c   size at p=eps")
for n in (300, 500, 1000):
    for nm, ab in [("exact", None), ("Jeffreys", (.5, .5))] + [("twin w=%g" % w, power_prior(F, NSIM, w)) for w in (0.003, 0.01, 0.03)]:
        c = c_freq(n, EPS, DELTA) if ab is None else c_bayes(n, ab[0], ab[1], EPS, DELTA)
        print("%-5d %-24s %-3d %.4f" % (n, nm, c, false_cert(n, c, EPS)))

print("\n== 4. Does the twin save real trials? n for power 0.9 at p = eps/3, and the exact test held to the same worst-case size ==")
P = EPS / 3
ne = n_for_power(lambda n: c_freq(n, EPS, DELTA), P, 0.9)
print("exact test at level 0.05: n = %d" % ne)
for nm, ab in [("Jeffreys", (.5, .5))] + [("twin w=%g" % w, power_prior(F, NSIM, w)) for w in (0.003, 0.01, 0.03)]:
    nb = n_for_power(lambda n: c_bayes(n, ab[0], ab[1], EPS, DELTA), P, 0.9)
    cb = c_bayes(nb, ab[0], ab[1], EPS, DELTA)
    size = false_cert(nb, cb, EPS)
    nl = n_for_power(lambda n: c_freq(n, EPS, size), P, 0.9)
    print("%-16s n = %-5d (c=%d) worst-case size %.4f; exact test at level %.4f needs n = %d" % (nm, nb, cb, size, size, nl))

print("\n== 5. Wrong twin: twin claims p = lam*eps from %d rollouts, w=0.01, n=400 ==" % NSIM)
ce = c_freq(400, EPS, DELTA)
print("lam     c   size at p=eps   power at p=eps/3   power at p=eps/10   [exact test: c=%d, size %.4f, power at eps/3 %.4f, at eps/10 %.4f]" % (ce, false_cert(400, ce, EPS), power(400, ce, EPS / 3), power(400, ce, EPS / 10)))
for lam in (0.01, 0.1, 0.5, 1.0, 2.0, 5.0):
    f = round(lam * EPS * NSIM)
    a, b = power_prior(f, NSIM, 0.01)
    c = c_bayes(400, a, b, EPS, DELTA)
    print("%-7g %-3d %-15.4f %-18.4f %.4f" % (lam, c, false_cert(400, c, EPS), power(400, c, EPS / 3), power(400, c, EPS / 10)))

print("\n== 6. Largest twin weight keeping the worst-case size at n within tolerance (twin claims eps/100) ==")
print("n     tol    max w      equivalent twin trials (w*N)")
for n in (299, 500, 1000):
    for tol in (0.05, 0.06, 0.08, 0.1):
        w = max_weight(F, NSIM, EPS, DELTA, n, tol)
        print("%-5d %.2f   %-10.3g %.3g" % (n, tol, w, w * NSIM))
