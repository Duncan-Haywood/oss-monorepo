"""Write experiments/yield_curve.svg: assembly yield against nominal diametral clearance, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== yield curve", 0, [1, 2])
    series = [("Monte Carlo, size sd 0.05 mm", xs, ys[0]), ("closed form, exact sizes", xs, ys[1])]
    write_lines(HERE, "yield_curve.svg", "Two-pin cover: assembly yield against clearance (position sd 0.10 mm)",
                "Line plot of assembly yield against nominal diametral clearance from 0.1 to 2.0 mm; yield rises from near 0 to 1 by about 1 mm, and the two curves are almost the same",
                "nominal diametral clearance c (mm)", "assembly yield", series)


if __name__ == "__main__":
    main()
