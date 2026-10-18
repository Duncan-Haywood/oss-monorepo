"""Write experiments/cells_by_digits.svg: mean cells against CSD non-zero digit count, from results.txt.

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
    ds = sorted({r["nd"] for r in R if r["nd"] > 1})
    series = [(f, [float(d) for d in ds], [mean(r[f][0] for r in R if r["nd"] == d) for d in ds])
              for f in ("op", "bin", "csd")]
    write_lines(HERE, "cells_by_digits.svg", "Mean generic-gate cells of x*K against CSD digit count",
                "Line plot of mean Yosys generic-gate cells for an 8-bit input times a constant, for the operator, binary "
                "shift-add and canonical-signed-digit forms; the signed-digit form is lowest at two to four digits",
                "non-zero CSD digits of K", "mean cells", series)


if __name__ == "__main__":
    main()
