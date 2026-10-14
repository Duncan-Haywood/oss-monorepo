"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from terrain_twin import *

K, DELTA = 4, 1e-3
print("Friction per patch ~ Gamma(shape k, mean m); k=%d means CV=1/sqrt(k)=%.2f. Certification level delta=%g. Distances in units of d0=W0/m (twin-mean stopping distance)." % (K, K ** -0.5, DELTA))

print("\n== 1. Certified distance from a twin with n independent cells across it, and the real P(D > certified) when j patches span it ==")
print("n (twin cells)  certified/d0 | real exceedance at j = 1, 3, 10, 30, 100")
for n in (10, 100, 1000, 10000):
    f = certified_factor(DELTA, n, K)
    print("%-15d %-12.3f | %s" % (n, f, "  ".join("%.3g" % real_exceedance(f, j, K) for j in (1, 3, 10, 30, 100))))

print("\n== 2. Distance the real terrain needs for delta=%g, vs what an n=1000 twin certifies ==" % DELTA)
f1000 = certified_factor(DELTA, 1000, K)
print("twin (n=1000) certifies %.3f d0" % f1000)
print("j patches   required/d0   required/twin-certified")
for j in (1, 2, 3, 5, 10, 30, 100, 1000):
    r = certified_factor(DELTA, j, K)
    print("%-11d %-13.3f %.2f" % (j, r, r / f1000))

print("\n== 3. Sensitivity to friction spread (n=1000 twin, delta=%g): certified/d0, then delivered exceedance at j=1, 3, 10 ==" % DELTA)
for k in (2, 4, 10, 25):
    f = certified_factor(DELTA, 1000, k)
    print("k=%-3d CV=%.2f certified/d0=%.3f  exceedance: %s" % (k, k ** -0.5, f, "  ".join("%.3g" % real_exceedance(f, j, k) for j in (1, 3, 10))))

print("\n== 4. The mean is nearly right, the tail is not: braking simulation, random start phase, E[D]/d0 and P(D > 1.2 d0), 20000 runs, k=%d ==" % K)
print("L/d0    E[D]/d0   P(D>1.2 d0)   (single-patch limit: E[D]/d0 = k/(k-1) = %.3f)" % (K / (K - 1)))
rng = random.Random(2024)
N = 20000
for L in (0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 100.0):
    ds = [stop_distance(rng, L, K, 1.0) for _ in range(N)]
    print("%-7g %-9.3f %.4f" % (L, sum(ds) / N, sum(d > 1.2 for d in ds) / N))

print("\n== 5. Check: closed form vs braking simulation, aligned start, s=j*L, 200000 runs ==")
print("j    s/d0   closed form   simulation")
rng = random.Random(11)
for j, s in ((1, 2.0), (4, 1.4), (10, 1.2)):
    n = 200000
    sim = sum(stop_distance(rng, s / j, K, 1.0, phase=False) > s for _ in range(n)) / n
    print("%-4d %-6g %-13.4g %.4g" % (j, s, real_exceedance(s, j, K), sim))

print("\n== 6. Repair: rebuild the twin with the measured correlation length. True j=4; twin assumes j_est patches across the distance (delta=%g) ==" % DELTA)
print("j_est   certified/d0   real exceedance at true j=4")
for je in (1, 2, 4, 8, 16, 1000):
    f = certified_factor(DELTA, je, K)
    print("%-7d %-14.3f %.3g" % (je, f, real_exceedance(f, 4, K)))
