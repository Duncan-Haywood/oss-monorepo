"""Prints the results tables. Stdlib only; about 20 s."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from ratelimit_burst import LIMITERS, flood_pattern_search, poisson_overload
from ratelimit_burst.analysis import two_burst_search

print("# Worst admitted count in any rolling window of W ticks (limit L)")
for L, W in [(10, 20), (20, 40), (50, 100)]:
    print(f"\nL={L} W={W}")
    print("limiter\tflood+idle\ttwo bursts\tratio to L")
    for cls in LIMITERS:
        f, _ = flood_pattern_search(cls, L, W)
        # two-burst search is O(W^3) simulations: only for the smaller sizes
        tb = two_burst_search(cls, L, W) if W <= 40 else None
        worst = max(f, tb or 0)
        print(f"{cls.name}\t{f}\t{tb if tb is not None else 'n/a'}\t{worst / L:.2f}")

print("\n# Poisson overload, L=50 W=100, 2000 windows, seed 1")
print("load\tlimiter\tadmitted per window\tshare of rolling windows over L")
for load in (0.8, 1.5, 3.0, 10.0):
    for cls in LIMITERS:
        a, o = poisson_overload(cls, 50, 100, load)
        print(f"{load}\t{cls.name}\t{a:.1f}\t{o:.3f}")
