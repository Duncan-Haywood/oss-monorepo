"""Milestone 2l: the sign boundary of LS/OC shaft energy in (dp_ls, open-centre neutral pressure).

Reuses 2g's `ratio` at load factor 0.346, LS standby 2 L/min (ASSUMED), 600 cycles per seed. p_n is 2i's sourced
valve-only drop for 4 sections (1.44 bar) plus an ASSUMED extra of 0, 5 or 10 bar. Writes ranking_map_results.txt
(via stdout) and ranking_map.svg. A cell below 1 means load-sensing uses less shaft energy.

    python3 experiments/ranking_map.py > experiments/ranking_map_results.txt
"""
import os, sys
from pathlib import Path
sys.path.insert(0, os.path.dirname(__file__))
from idle_models import ratio
from neutral_sourced import p_n_text

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
DPLS = tuple(range(8, 34, 2))
EXTRAS = (0.0, 5.0, 10.0)


def crossing(xs, ys):
    for (x0, y0), (x1, y1) in zip(zip(xs, ys), zip(xs[1:], ys[1:])):
        if y0 < 1.0 <= y1:
            return x0 + (1.0 - y0) * (x1 - x0) / (y1 - y0)
    return None


def main():
    print("load factor 0.346; LS standby 2 L/min; 3,000 cycles per cell; LS/OC median")
    series, be = [], []
    for extra in EXTRAS:
        p = p_n_text(4) + extra
        ys = [ratio(0.346, p, 2.0, n_per_seed=600, dp_ls=float(d))[0] for d in DPLS]
        mono = all(b >= a - 1e-9 for a, b in zip(ys, ys[1:]))
        x = crossing(DPLS, ys)
        be.append((p, x))
        print(f"p_n {p:5.2f} bar: monotone={mono}; break-even dp_ls = {x:.1f} bar" if x else f"p_n {p:5.2f}: no crossing")
        print("  " + " ".join(f"{d}:{y:.3f}" for d, y in zip(DPLS, ys)))
        series.append((f"p_n {p:.1f} bar", [float(d) for d in DPLS], ys))
    (p0, x0), (p2, x2) = be[0], be[-1]
    if x0 and x2:
        print(f"slope of break-even dp_ls on p_n: {(x2 - x0) / (p2 - p0):.2f} bar per bar")
    from linefig import write_lines
    write_lines(HERE, "ranking_map.svg",
                "Load-sensing vs open-centre shaft energy, by LS margin",
                "Line plot of the median load-sensing to open-centre shaft-energy ratio against load-sensing margin pressure for three open-centre neutral pressures; load-sensing wins below the crossing of the dashed line at 1.0",
                "LS margin dp_ls (bar)", "LS / OC median shaft energy", series, hline=1.0)


if __name__ == "__main__":
    main()
