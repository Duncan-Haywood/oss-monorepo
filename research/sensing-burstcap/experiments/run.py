"""Sweep the largest area ratio a K-frame burst matches, and check the closed form by Monte Carlo.

    PYTHONPATH=src python experiments/run.py > experiments/results.txt
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from sensing_burstcap import frames_needed, max_area_ratio, signal_for_area_ratio  # noqa: E402

KS = (4, 8, 15)
RS = (1, 2, 3, 5, 10)
ES = (1, 3, 10, 30, 100, 300, 1000, 10000)


def mc_var_ratio(e, r, K, A, n=200000, seed=0):
    """Monte Carlo variance of a K-frame mean over variance of one A-times-area frame (s = 1, so signal e = x)."""
    rng = np.random.default_rng(seed)
    burst = (rng.poisson(e, (n, K)) + r * rng.standard_normal((n, K))).mean(1)
    large = (rng.poisson(A * e, n) + r * rng.standard_normal(n)) / A
    return burst.var() / large.var()


def main():
    print("== A. largest area ratio A_max a K-frame burst matches (per-frame signal e in electrons, read noise r in electrons)")
    for K in KS:
        print(f"K = {K} (limits: shot {K}, read {K ** 0.5:.2f})")
        print("r \\ e | " + " | ".join(str(e) for e in ES))
        for r in RS:
            print(f"{r} | " + " | ".join(f"{max_area_ratio(e, r, K):.2f}" for e in ES))
    print()
    print("== B. per-frame signal e (electrons) at which K frames just match area ratio A (None: any/no light level)")
    for K in KS:
        print(f"K = {K}")
        for A in (2, 3, 4, 6, 8, 12):
            print(f"A={A} | " + " | ".join(f"r={r}: " + (lambda v: "none" if v is None else f"{v:.1f}")(signal_for_area_ratio(r, K, A)) for r in RS))
    print()
    print("== C. Monte Carlo (200,000 draws) of burst variance / large-frame variance at A_max; the closed form says 1.000")
    print("K | r | e | A_max | var ratio")
    worst = 0.0
    for K in KS:
        for r in (2, 5):
            for e in (3, 30, 300):
                A = max_area_ratio(e, r, K)
                ratio = mc_var_ratio(e, r, K, A)
                worst = max(worst, abs(ratio - 1))
                print(f"{K} | {r} | {e} | {A:.3f} | {ratio:.3f}")
    print(f"worst |ratio - 1| = {worst:.3f}")
    print()
    print("== D. consistency: frames_needed at A_max equals K")
    print("max abs error:", max(abs(frames_needed(e, r, max_area_ratio(e, r, K)) - K) for K in KS for r in RS for e in ES))


if __name__ == "__main__":
    main()
