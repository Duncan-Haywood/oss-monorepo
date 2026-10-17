"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from sparse_outer_sync import *

s, V = 1.0, 1.0

print("== 1. Stationary variance: exact vs literal simulation (s=V=1; 400k rounds, 2k burn-in) ==")
print("N   p     alpha  rule      exact     sim       ratio")
for N, p, al in ((1, 0.5, 0.3), (4, 0.25, 0.4), (6, 0.1, 0.15)):
    for mode, fl in (("unbiased", floor_unbiased), ("ef", floor_ef)):
        th = fl(s, V, al, N, p)
        emp = simulate(mode, s, V, al, N, p, 400000, 2000, seed=1)
        print("%-3d %-5.2f %-6.2f %-9s %.5f   %.5f   %.3f" % (N, p, al, mode, th, emp, emp / th))

print("\n== 2. Small-step penalty over uncompressed (N=8): unbiased ~ 1/p, error feedback ~ 1 + alpha s (1/p - 1) ==")
print("p      alpha   unbiased  1/p     ef        1+a*s*w")
for p in (0.5, 0.25, 0.1, 0.05):
    for al in (0.01, 0.05):
        f0 = floor_full(s, V, al, 8)
        print("%-6.2f %-7.2f %-9.3f %-7.2f %-9.4f %.4f" % (p, al, floor_unbiased(s, V, al, 8, p) / f0, 1 / p,
                                                       floor_ef(s, V, al, 8, p) / f0, 1 + al * s * (1 / p - 1)))

print("\n== 3. Largest stable outer step alpha s (uncompressed: 2) ==")
print("N    p      unbiased  error-feedback")
for N in (1, 4, 32):
    for p in (0.5, 0.25, 0.1):
        print("%-4d %-6.2f %-9.3f %.3f" % (N, p, alpha_max_unbiased(s, N, p), alpha_max_ef(s, N, p)))
print("N=1 closed form 2p/(2-p): p=0.5 -> %.4f, p=0.1 -> %.4f" % (1.0 / 1.5, 0.2 / 1.9))

print("\n== 4. Mean contraction under error feedback: sqrt(1-p) on a band of alpha s, whatever N ==")
print("p      fastest  band alpha s                  rate at alpha s=0.1  1-alpha s")
for p in (0.5, 0.25, 0.1, 0.02):
    lo, hi = critical_alpha_s(p)
    print("%-6.2f %-8.4f [%.4f, %.4f]        %-20.4f %.4f" % (p, fastest_rate(p), lo, hi, mean_rate(0.1, p), 0.9))

print("\n== 5. Floor at a target mean rate (N=8, s=V=1): best alpha with rate <= target; '-' = unreachable ==")
def scan(rate, fl, target):
    best, al = None, 1e-4
    while al < 8:
        if rate(al) <= target:
            f = fl(al)
            best = f if best is None or f < best else best
        al *= 1.005
    return best
for p in (0.25, 0.1):
    print("p = %.2f (fastest ef rate %.3f)" % (p, fastest_rate(p)))
    print("  target  full     unbiased  error-feedback")
    for tg in (0.98, 0.95, 0.9, 0.8, 0.6):
        f0 = floor_full(s, V, 1 - tg, 8)
        u = scan(lambda a: 1 - a * s, lambda a: floor_unbiased(s, V, a, 8, p), tg)
        e = scan(lambda a: mean_rate(a * s, p), lambda a: floor_ef(s, V, a, 8, p), tg)
        print("  %-7.2f %-8.4f %-9.4f %s" % (tg, f0, u, "-" if e is None else "%.4f" % e))

print("\n== 6. Spectrum (eta=0.05, sigma=1, H=8, N=16, a = 1, 0.3, 0.1, 0.03): exact loss after T rounds from x=1, best outer step ==")
A = [1.0, 0.3, 0.1, 0.03]
def best(rule, p, T):
    b, ba, al = math.inf, None, 0.02
    while al < 3:
        v = loss_after(rule, A, 0.05, 1.0, 8, al, 16, p, T)
        if v < b:
            b, ba = v, al
        al *= 1.03
    return b, ba
for T in (100, 400):
    print("T = %d" % T)
    for p in (1.0, 0.25, 0.1, 0.03):
        u, ua = best("unbiased", p, T)
        e, ea = best("ef", p, T)
        print("  p=%-5.2f unbiased %.5f (alpha %.2f)   ef %.5f (alpha %.2f)   ef/unbiased %.3f" % (p, u, ua, e, ea, e / u))
