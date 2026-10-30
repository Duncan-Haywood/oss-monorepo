"""Milestone 2m: how the 2l break-even LS margin moves with load factor.

Same model as ranking_map.py (2g `ratio`, LS standby 2 L/min ASSUMED, 600 cycles x 5 seeds per cell), at open-centre
neutral pressure 1.44 bar (2i, valve only) and 6.44 bar (+5 assumed), for five load factors. Break-even dp_ls is the
linear-interpolated crossing of the median LS/OC at 1.0 (None if outside 4 to 60 bar).

    python3 experiments/ranking_map_lf.py > experiments/ranking_map_lf_results.txt
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from idle_models import ratio
from neutral_sourced import p_n_text
from ranking_map import crossing

LFS = (0.15, 0.25, 0.346, 0.5, 0.7)
DPLS = tuple(range(4, 62, 4))
EXTRAS = (0.0, 5.0)


def main():
    print("LS standby 2 L/min; 3,000 cycles per cell; break-even dp_ls (bar) where median LS/OC = 1")
    for extra in EXTRAS:
        p = p_n_text(4) + extra
        print(f"\np_n {p:.2f} bar")
        for lf in LFS:
            ys = [ratio(lf, p, 2.0, n_per_seed=600, dp_ls=float(d))[0] for d in DPLS]
            mono = all(b >= a - 1e-9 for a, b in zip(ys, ys[1:]))
            x = crossing(DPLS, ys)
            print(f"  load factor {lf:5.3f}: monotone={mono}; break-even = " + (f"{x:.1f}" if x else "none in range")
                  + f"  (median LS/OC at dp_ls 16: {ys[DPLS.index(16)]:.3f}; at 24: {ys[DPLS.index(24)]:.3f})")


if __name__ == "__main__":
    main()
