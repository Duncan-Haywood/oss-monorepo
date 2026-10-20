"""Reproduces every number in paper/whitepaper.md. Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import math
import random
from watchdog_twin.model import (iid_L, twin_mtt, real_mtt, real_rate_approx, twin_rate_approx, min_m, m_real_approx,
                                 m_twin_approx, simulate_first_trip, simulate_first_trip_iid)

P = 0.05
HZ = 50.0

print("Watchdog twin: real = Gilbert link (loss iff bad state, mean loss p, mean burst L); twin = i.i.d. loss at the same p")
print("watchdog trips after m consecutive lost heartbeats; p = %g; times in ticks (1 tick = 1/%g s)" % (P, HZ))

print("\n== 1. Mean time to false trip (ticks): twin vs real, same mean loss ==")
Ls = (iid_L(P), 2, 5, 10, 20, 50)
print("  m   twin        " + "  ".join("real L=%-6.4g" % L for L in Ls))
for m in (3, 5, 8, 12):
    print("  %-3d %-11.4g " % (m, twin_mtt(P, m)) + "  ".join("%-12.4g" % real_mtt(P, L, m) for L in Ls))
print("  (L = %.4f is the i.i.d. burst length: real equals twin there)" % iid_L(P))

print("\n== 2. Twin / real ratio of mean time to trip at m = 5 ==")
for L in Ls[1:]:
    print("  L = %-3g  twin %.4g  real %.4g  ratio %.3g" % (L, twin_mtt(P, 5), real_mtt(P, L, 5), twin_mtt(P, 5) / real_mtt(P, L, 5)))

print("\n== 3. Worst burst length for each m (p = %g): argmin_L real mean time to trip, and its value vs e*m/p ==" % P)
print("  m    L*      MTT(L*)    e*m/p     twin MTT")
for m in (3, 5, 8, 12, 20):
    grid = [1.0 + 0.05 * i for i in range(0, int(4 * m / 0.05))]
    best = min(grid, key=lambda L: real_mtt(P, L, m))
    print("  %-3d  %-6.2f  %-9.4g  %-8.4g  %.4g" % (m, best, real_mtt(P, best, m), math.e * m / P, twin_mtt(P, m)))

print("\n== 4. Large-m rate approximations vs exact (p = %g) ==" % P)
print("  m    L     exact 1/MTT   approx p/L(1-1/L)^(m-1)   ratio")
for m, L in ((10, 5), (20, 5), (20, 10), (40, 10)):
    ex = 1 / real_mtt(P, L, m)
    ap = real_rate_approx(P, L, m)
    print("  %-3d  %-4g  %-12.4g  %-24.4g  %.4f" % (m, L, ex, ap, ex / ap))
for m in (4, 6, 8):
    ex = 1 / twin_mtt(P, m)
    print("  twin m=%d: exact %.4g  approx (1-p)p^m %.4g  ratio %.6f" % (m, ex, twin_rate_approx(P, m), ex / twin_rate_approx(P, m)))

print("\n== 5. Choosing m in the twin vs the real link: smallest m with mean time to false trip >= target ==")
print("  target = 1e6 ticks (%.1f h at %g Hz)" % (1e6 / HZ / 3600, HZ))
tw = min_m(lambda m: twin_mtt(P, m), 1e6)
print("  twin picks m = %d (continuous approx %.2f)" % (tw, m_twin_approx(P, 1e6)))
print("  L     real m needed (approx)   MTT real at twin's m  (ticks / seconds)   latency to detect a dead link: twin m vs real m (s)")
for L in (2, 5, 10, 20):
    mr = min_m(lambda m: real_mtt(P, L, m), 1e6)
    mtt = real_mtt(P, L, tw)
    print("  %-4g  %-4d (%.1f)               %-10.4g / %-9.4g          %.2f vs %.2f" % (L, mr, m_real_approx(P, L, 1e6), mtt, mtt / HZ, tw / HZ, mr / HZ))

print("\n== 6. Guarantee without knowing L: smallest m with min over L of the mean time to trip >= target (p = %g) ==" % P)
print("  worst case searched on L in [m/2, 2m] (geometric grid of 41); m by bisection; the min is near L = m, MTT_min ~ e*m/p")


def worst_mtt(m):
    return min(real_mtt(P, max(1.0, m / 2) * 4 ** (i / 40), m) for i in range(41))


for tgt in (1e3, 1e4):
    lo, hi = 1, 4
    while worst_mtt(hi) < tgt:
        hi *= 2
    while lo < hi:
        mid = (lo + hi) // 2
        if worst_mtt(mid) >= tgt:
            hi = mid
        else:
            lo = mid + 1
    print("  target %-8g ticks  m = %-5d  (e*m/p = %.4g; detection latency %.1f s at %g Hz)" % (tgt, lo, math.e * lo / P, lo / HZ, HZ))
print("  target 1e6 ticks: e*m/p >= 1e6 needs m >= %d (latency %.0f s), versus the twin's m = %d" % (
    math.ceil(1e6 * P / math.e), math.ceil(1e6 * P / math.e) / HZ, tw))

print("\n== 7. Monte Carlo check (seed 7, 20000 runs each) ==")
rng = random.Random(7)
n = 20000
for (L, m) in ((5, 5), (10, 4), (2, 6)):
    mc = sum(simulate_first_trip(P, L, m, rng) for _ in range(n)) / n
    print("  real L=%-3g m=%d: MC %.1f  exact %.1f  (ratio %.3f)" % (L, m, mc, real_mtt(P, L, m), mc / real_mtt(P, L, m)))
for m in (3,):
    mc = sum(simulate_first_trip_iid(P, m, rng) for _ in range(n)) / n
    print("  twin m=%d:       MC %.1f  exact %.1f  (ratio %.3f)" % (m, mc, twin_mtt(P, m), mc / twin_mtt(P, m)))
