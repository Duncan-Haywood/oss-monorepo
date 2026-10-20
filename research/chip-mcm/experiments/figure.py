"""Write experiments/cells_by_bank.svg: mean cells against bank size M, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE))
from analyse import load  # noqa: E402
from linefig import write_lines  # noqa: E402


def main():
    R = load()
    ms = sorted({r["m"] for r in R})
    series = [(f, [float(m) for m in ms], [mean(r[f][0] / m for r in R if r["m"] == m) for m in ms]) for f in ("op", "csd", "mcm")]
    write_lines(HERE, "cells_by_bank.svg", "Mean generic-gate cells per constant against bank size",
                "Line plot of mean Yosys generic-gate cells per constant multiplier for banks of 2 to 16 random 8-bit constants, "
                "for the operator, per-constant signed-digit and shared-sub-sum forms; the shared form falls furthest as the bank grows",
                "constants in the bank (M)", "mean cells per constant", series)


if __name__ == "__main__":
    main()
