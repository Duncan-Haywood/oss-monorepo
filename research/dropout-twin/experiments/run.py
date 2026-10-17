"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math, random, statistics
from dropout_twin import *

P, DELTA = 0.10, 1e-3
LAMS = (0.3, 0.6, 0.8)
print("Thin-obstacle detection: an obstacle subtends m adjacent beams and is detected iff >= k return. Marginal dropout p=%.2f." % P)
print("Twin: i.i.d. dropout.  Real: stationary two-state Markov chain along the scan, same p, lag-1 correlation lam.")
print("Twin certificate: smallest width m with twin miss probability <= delta=%g." % DELTA)

print("\n== 0. Exact law vs Monte Carlo (720-beam scans, obstacle at a random offset, 200,000 scans) ==")
rng = random.Random(11)
print("k  m  lam   exact      MC (+- se)")
for k, m, lam in ((1, 3, 0.6), (1, 5, 0.8), (2, 6, 0.6), (2, 10, 0.8)):
    ex = miss_markov(m, k, P, lam)
    mc = scan_miss_mc(200000, 720, m, k, P, lam, rng)
    print("%d  %-2d %.1f   %.6f   %.6f +- %.6f" % (k, m, lam, ex, mc, math.sqrt(max(mc, 1e-6) * (1 - mc) / 200000)))

print("\n== 1. Real miss probability at the twin-certified width ==")
print("k  m_twin  twin miss   " + "   ".join("real lam=%.1f (x)" % l for l in LAMS))
for k in (1, 2):
    mt = min_width(DELTA, lambda m: miss_iid(m, k, P))
    row = []
    for l in LAMS:
        v = miss_markov(mt, k, P, l)
        row.append("%.5f (%.0fx)" % (v, v / miss_iid(mt, k, P)))
    print("%d  %-6d  %.6f    %s" % (k, mt, miss_iid(mt, k, P), "   ".join(row)))

print("\n== 2. Width the real sensor needs, and the detection-range ratio (range ~ 1/m for fixed angular resolution) ==")
print("k  lam   m_twin  m_real  range claimed/real (=m_real/m_twin)")
for k in (1, 2):
    mt = min_width(DELTA, lambda m: miss_iid(m, k, P))
    for l in (0.0,) + LAMS:
        mr = min_width(DELTA, lambda m: miss_markov(m, k, P, l))
        print("%d  %.1f   %-6d  %-6d  %.2f" % (k, l, mt, mr, mr / mt))

print("\n== 3. Closed form for k=1: miss = p q^(m-1), ratio to i.i.d. = (1+lam(1-p)/p)^(m-1) ==")
print("lam   m=3 ratio   m=6 ratio   m=12 ratio")
for l in LAMS:
    print("%.1f   %-10.2f  %-10.2f  %-10.2f" % (l, *[miss_k1_markov(m, P, l) / miss_iid(m, 1, P) for m in (3, 6, 12)]))

print("\n== 4. Inflating the twin's drop rate to match real miss at one width (k=1, lam=0.6) ==")
l = 0.6
print("calibrated at m0   p'     real miss at m=3    m=6         m=12       (twin-with-p' miss at the same m in brackets)")
for m0 in (2, 4, 8):
    pp = inflated_p(m0, 1, l, P)
    cells = []
    for m in (3, 6, 12):
        cells.append("%.2e [%.2e]" % (miss_markov(m, 1, P, l), miss_iid(m, 1, pp)))
    print("%-16d   %.3f  %s" % (m0, pp, "  ".join(cells)))
mt = min_width(DELTA, lambda m: miss_iid(m, 1, inflated_p(4, 1, l, P)))
print("width certified by the m0=4 inflated twin at delta=%g: %d; real needs %d; real miss at %d = %.2e" % (
    DELTA, mt, min_width(DELTA, lambda m: miss_markov(m, 1, P, l)), mt, miss_markov(mt, 1, P, l)))

print("\n== 5. Repair: fit (q, r) from an n-beam log of a flat target (200 repeats), certify with the fitted chain; k=1, lam=0.6 ==")
l = 0.6
mreal = min_width(DELTA, lambda m: miss_markov(m, 1, P, l))
print("true needed width %d. real miss is evaluated with the TRUE chain at the width each method certifies." % mreal)
print("n beams   fitted-chain: median real miss [10th,90th]  share > delta   median width    i.i.d. fit (p_hat only): median width, share > delta")
for n in (200, 1000, 5000, 20000):
    rng = random.Random(100 + n)
    rm, ws, wi, r2 = [], [], [], []
    for _ in range(200):
        mask = sample_mask(n, P, l, rng)
        ph = sum(mask) / n
        qr_ = fit_chain(mask)
        if qr_ is None or ph == 0:
            continue
        q, r = qr_
        w = min_width(DELTA, lambda m: miss_chain(m, 1, q, r), mmax=400)
        w = 400 if w is None else w
        ws.append(w)
        rm.append(miss_markov(w, 1, P, l))
        r2.append(miss_markov(w + 2, 1, P, l))
        wi.append(min_width(DELTA, lambda m: miss_iid(m, 1, ph)))
    rm.sort()
    q10, q90 = rm[len(rm) // 10], rm[9 * len(rm) // 10]
    shr = sum(1 for v in rm if v > DELTA * (1 + 1e-9)) / len(rm)
    shi = sum(1 for w in wi if miss_markov(w, 1, P, l) > DELTA * (1 + 1e-9)) / len(wi)
    sh2 = sum(1 for v in r2 if v > DELTA * (1 + 1e-9)) / len(r2)
    print("%-8d  %.2e [%.2e, %.2e]            %.2f          %-6d          %d, %.2f" % (
        n, statistics.median(rm), q10, q90, shr, statistics.median(ws), statistics.median(wi), shi))
    print("          same fit with 2 extra beams of width: share > delta %.2f" % sh2)
