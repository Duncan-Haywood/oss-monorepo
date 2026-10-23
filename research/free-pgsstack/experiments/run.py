"""Iterations a projected Gauss-Seidel solver needs to hold a stack of n unit boxes still.

    python3 experiments/run.py > experiments/results.txt
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pgsstack import run  # noqa: E402

NS = [2, 3, 4, 6, 8, 12, 16, 24, 32]
KS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]
SPEED_TOL, SAG_TOL = 1e-3, 1e-4     # m/s and m summed over the stack, last second of 3 s at 60 Hz


def holds(r):
    return r["speed"] < SPEED_TOL and r["sag"] < SAG_TOL


def needed(n, **kw):
    """Smallest K in KS such that K and every larger K in KS holds; None if 2048 does not."""
    res = [holds(run(n, k, **kw)) for k in KS]
    for j in range(len(KS)):
        if all(res[j:]):
            return KS[j]
    return None


def main():
    print("1. iterations per step needed to hold an n-box stack still (60 Hz, beta 0.2, m = 1 kg, h = 1 m)")
    print("   hold = speed < %g m/s and total overlap < %g m for the last second of 3 s, and for every larger K tried" % (SPEED_TOL, SAG_TOL))
    print("   n  bottom-up_warm  top-down_warm  bottom-up_cold  top-down_cold   n^2")
    for n in NS:
        row = [needed(n, order=o, warm=w) for o in ("up", "down") for w in (True, False)]
        cells = ["%14s" % (">2048" if x is None else x) for x in row]
        print("%4d %s  %6d" % (n, " ".join(cells[i] for i in (0, 2, 1, 3)), n * n))
        sys.stdout.flush()
    print()
    print("2. state after 3 s against iterations, n = 16, bottom-up, warm start")
    print("   K   max_overlap_m  max_speed_mps  worst_impulse_relerr")
    for k in KS:
        r = run(16, k)
        print("%5d %13.5f %14.4f %20.3f" % (k, r["sag"], r["speed"], r["lam_err"]))
    print()
    print("3. same, n = 6")
    print("   K   max_overlap_m  max_speed_mps  worst_impulse_relerr")
    for k in KS[:8]:
        r = run(6, k)
        print("%5d %13.5f %14.4f %20.3f" % (k, r["sag"], r["speed"], r["lam_err"]))


if __name__ == "__main__":
    main()
