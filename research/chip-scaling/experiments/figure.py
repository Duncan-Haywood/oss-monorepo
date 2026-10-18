"""Write experiments/cells_vs_width.svg: generic-gate cells against bit width per block, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
KINDS = ["add", "shift", "popcount", "mul"]


def main():
    series = []
    for k in KINDS:
        xs, ys = table(TEXT, f"   {k}:", 0, [1])
        series.append((k, xs, ys[0]))
    write_lines(HERE, "cells_vs_width.svg", "Generic-gate cells against bit width (log-log)",
                "Log-log line plot of Yosys generic-gate cells against bit width for adder, shifter, popcount and multiplier; "
                "the multiplier climbs about twice as steeply as the others",
                "bit width W", "cells", series, logx=True, logy=True)


if __name__ == "__main__":
    main()
