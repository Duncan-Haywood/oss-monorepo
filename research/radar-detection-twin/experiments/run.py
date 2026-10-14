"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
from radar_detection_twin import *

N = 16
KS = (8, 12, 14)  # OS ranks: N/2, 3N/4, 7N/8
grids = {}
G = lambda nu: grids.setdefault(nu, TextureGrid(nu))
db = lambda x: 10 * math.log10(x)
print("N=%d reference cells, independent gamma texture per cell (shape nu), twin = Gaussian clutter, OS ranks k=%s" % (N, KS))


def dets(nu):
    """(name, exceedance fn) for CA and each OS rank; nu=None is the Gaussian twin."""
    g = None if nu is None else G(nu)
    out = [("CA", pd_fn("ca", N, grid=g))]
    out += [("OS k=%d" % k, pd_fn("os", N, k, g)) for k in KS]
    return out


print("\n== 1. Real Pfa when the threshold is set in the Gaussian twin ==")
print("design Pfa  nu    " + "  ".join("%-16s" % n for n, _ in dets(None)))
for pf in (1e-2, 1e-4, 1e-6):
    tw = dets(None)
    al = [alpha_for_pfa(pf, f) for _, f in tw]
    for nu in (2, 5, 20):
        row = ["%.2e (%.1fx)" % (f(a, 0), f(a, 0) / pf) for a, (_, f) in zip(al, dets(nu))]
        print("%-10g  %-4g  %s" % (pf, nu, "  ".join("%-16s" % r for r in row)))

print("\n== 2. Exact laws vs direct Monte Carlo (design Pfa 1e-2, 400k trials) ==")
for nu in (2, 5):
    for name, kind, k in (("CA", "ca", None), ("OS k=12", "os", 12)):
        f = pd_fn(kind, N, k, None)
        a = alpha_for_pfa(1e-2, f)
        ex = pd_fn(kind, N, k, G(nu))
        print("nu=%d %-8s MC Pfa %.4f exact %.4f | shared texture MC %.4f (twin design 0.0100)" % (
            nu, name, simulate(a, N, nu, 400000, 5 + nu, kind, k), ex(a, 0), simulate(a, N, nu, 400000, 50 + nu, kind, k, shared=True)))
    s = 8.0
    for name, kind, k in (("CA", "ca", None), ("OS k=12", "os", 12)):
        a = alpha_for_pfa(1e-2, pd_fn(kind, N, k, None))
        print("nu=%d %-8s target SNR %.0f (%.1f dB): MC Pd %.4f exact %.4f" % (
            nu, name, s, db(s), simulate(a, N, nu, 400000, 70 + nu, kind, k, snr=s), pd_fn(kind, N, k, G(nu))(a, s)))

print("\n== 3. Threshold multiplier restoring design Pfa in real clutter (vs the twin's), design 1e-4 ==")
print("nu   " + "  ".join("%-20s" % n for n, _ in dets(None)))
for nu in (2, 5, 20):
    row = []
    for (_, ft), (_, fr) in zip(dets(None), dets(nu)):
        at, ar = alpha_for_pfa(1e-4, ft), alpha_for_pfa(1e-4, fr)
        row.append("%.2fx (%.2f dB)" % (ar / at, db(ar / at)))
    print("%-4g %s" % (nu, "  ".join("%-20s" % r for r in row)))

print("\n== 4. SNR needed for Pd=0.9 at Pfa 1e-4 (dB, relative to local clutter mean) ==")
print("twin promise = threshold and Pd both computed in the Gaussian twin; real = repaired threshold (real Pfa 1e-4) and real Pd")
print("detector    twin promise   " + "  ".join("real nu=%-6g" % nu for nu in (2, 5, 20)) + "   shortfall (real - promise) dB")
tw = dets(None)
for i, (name, ft) in enumerate(tw):
    prom = snr_for_pd(ft, alpha_for_pfa(1e-4, ft), 0.9)
    reals = []
    for nu in (2, 5, 20):
        fr = dets(nu)[i][1]
        reals.append(snr_for_pd(fr, alpha_for_pfa(1e-4, fr), 0.9))
    print("%-10s  %-13.2f  %s   %s" % (name, db(prom), "  ".join("%-13.2f" % db(r) for r in reals),
                                       "  ".join("%.2f" % (db(r) - db(prom)) for r in reals)))

print("\n== 5. Detector ranking: best detector by SNR needed for Pd=0.9 at Pfa 1e-4 (dB relative to CA in the same world) ==")
print("world       " + "  ".join("%-9s" % n for n, _ in dets(None)) + "  best")
for label, nu in (("twin", None), ("nu=20", 20), ("nu=5", 5), ("nu=2", 2), ("nu=1.5", 1.5)):
    d = dets(nu)
    need = [snr_for_pd(f, alpha_for_pfa(1e-4, f), 0.9) for _, f in d]
    print("%-10s  %s  %s" % (label, "  ".join("%-9.2f" % (db(x) - db(need[0])) for x in need), d[need.index(min(need))][0]))

print("\n== 6. What the uncalibrated twin threshold does to Pd (Pd 0.9 target SNR from the twin promise, design Pfa 1e-4) ==")
print("detector   nu   real Pfa      real Pd at promised SNR")
for i, (name, ft) in enumerate(tw):
    at = alpha_for_pfa(1e-4, ft)
    s = snr_for_pd(ft, at, 0.9)
    for nu in (2, 5):
        fr = dets(nu)[i][1]
        print("%-9s  %-3g  %-12.2e  %.3f" % (name, nu, fr(at, 0), fr(at, s)))
