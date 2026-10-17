"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random
from validate_twin import *

print("Validating a twin's stated failure probability q against n real trials (real p = c*q). alpha = 0.05 throughout.")
print("Difference test = exact two-sided binomial test of p=q (twin 'passes' if not rejected); equivalence = exact TOST for p in [q/D, qD].")

print("\n== 0. Exact pass probability of the difference test vs simulation (20000 draws) ==")
print("q       n      c    exact     simulated")
rng = random.Random(1)
for q, n, c in ((0.005, 300, 2.0), (0.001, 2000, 3.0), (0.02, 200, 0.5)):
    M = max(int(n * q * 4 * max(c, 1)) + 40, 60)
    pv = pvals_two_sided(n, q, M)
    hit = 0
    for _ in range(20000):
        x = sum(1 for _ in range(n) if rng.random() < c * q)
        hit += pv[min(x, M)] > 0.05
    print("%-7g %-6d %-4g %-9.4f %.4f" % (q, n, c, diff_pass_prob(n, q, c * q), hit / 20000))

print("\n== 1. P(twin passes the difference test), q = 1e-3: a twin that is wrong by a factor c is 'validated' by a small real sample ==")
ns = (100, 500, 2000, 10000)
print("c      " + "".join("n=%-8d" % n for n in ns) + "  (expected real failures n*q = 0.1, 0.5, 2, 10 for a perfect twin)")
for c in (1.0, 1.5, 2.0, 3.0, 5.0, 0.5, 0.2):
    print("%-6g " % c + "".join("%-10.3f" % diff_pass_prob(n, 1e-3, c * 1e-3) for n in ns))

print("\n== 2. Real trials for 80% power to REJECT a twin off by factor c (difference test), as n*q = expected real failures of the twin ==")
print("q        c=2 n*q    c=3 n*q    c=0.5 n*q   c=1.5 n*q")
for q in (1e-2, 1e-3, 1e-4):
    row = []
    for c in (2.0, 3.0, 0.5, 1.5):
        n = n_first(lambda m: 1.0 - diff_pass_prob(m, q, c * q), 0.8, lo=max(5, int(0.3 / q)), hi=int(400 / q))
        row.append("%-10.2f" % (n * q) if n else "none     ")
    print("%-8g %s" % (q, "  ".join(row)))
print("normal-approx n*q = (z_.025 + z_.20 sqrt(c))^2/(c-1)^2, where alpha/2 and 20% tails:")
for c in (2.0, 3.0, 0.5, 1.5):
    print("  c=%-4g %.2f" % (c, (Z[0.025] + Z[0.20] * math.sqrt(c)) ** 2 / (c - 1) ** 2))

print("\n== 3. Equivalence testing: real failures needed to VALIDATE a perfect twin (c=1) within margin D with 80% power ==")
print("q        D=3 n*q    D=2 n*q    D=1.5 n*q  D=1.25 n*q")
for q in (1e-2, 1e-3):
    row = []
    for D in (3.0, 2.0, 1.5, 1.25):
        n = n_first(lambda m: tost_prob(m, q, D, q), 0.8, lo=int(2 / q), hi=int(5000 / q), step=1.05)
        row.append("%-10.1f" % (n * q) if n else "none      ")
    print("%-8g %s" % (q, "  ".join(row)))
print("large-count rule: relative sd 1/sqrt(nq) must fit inside ln D at z_.05+z_.20: nq ~ ((z_.05+z_.20)/ln D)^2:")
for D in (3.0, 2.0, 1.5, 1.25):
    print("  D=%-5g %.1f" % (D, ((Z[0.05] + Z[0.20]) / math.log(D)) ** 2))

print("\n== 4. False validation is capped at alpha by construction: P(TOST validates) as the real p moves across the margin (q=1e-3, D=2, n=20000, n*q=20) ==")
print("c       P(validated)")
for c in (0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5):
    print("%-7g %.4f" % (c, tost_prob(20000, 1e-3, 2.0, c * 1e-3)))
print("region (xl, xh) of validating failure counts:", tost_region(20000, 1e-3, 2.0))

print("\n== 5. Tightest margin D a perfect twin can be validated to (80% power) with n*q expected failures, q=1e-3 ==")
print("n*q    n         D_min")
for nq in (5, 10, 20, 50, 100, 400):
    n = int(nq / 1e-3)
    lo, hi = 1.01, 50.0
    for _ in range(40):
        mid = math.sqrt(lo * hi)
        ok = all(tost_prob(m, 1e-3, mid, 1e-3) >= 0.8 for m in (n, int(n * 1.03), int(n * 1.06)))
        if ok:
            hi = mid
        else:
            lo = mid
    print("%-6d %-9d %.3f" % (nq, n, hi))

print("\n== 6. Passing is weak evidence: twins with ln c ~ N(0, 0.7^2) (sd of ln c = 0.7, i.e. a factor 2.0), 'bad' = off by 2x or more; q=1e-3 ==")
print("n       n*q   P(bad)  P(pass)  P(pass|bad)  P(bad|pass)")
for n in (300, 1000, 3000, 10000, 30000):
    f = lambda p, n=n: diff_pass_prob(n, 1e-3, p)
    pb, pp, pbp, ppb = prior_bad_given_pass(n, 1e-3, 0.7, 2.0, f)
    print("%-7d %-5g %-7.3f %-8.3f %-12.3f %.3f" % (n, n * 1e-3, pb, pp, ppb, pbp))
print("Same prior, equivalence test with D=2 (validated = TOST passes):")
print("n       n*q   P(validated)  P(bad|validated)  P(validated|bad)")
for n in (10000, 30000, 100000):
    f = lambda p, n=n: tost_prob(n, 1e-3, 2.0, p)
    pb, pp, pbp, ppb = prior_bad_given_pass(n, 1e-3, 0.7, 2.0, f)
    print("%-7d %-5g %-13.3f %-17.3f %.3f" % (n, n * 1e-3, pp, pbp, ppb))
