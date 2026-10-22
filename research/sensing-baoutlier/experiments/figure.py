"""Write experiments/error_vs_mismatch.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [3, 5, 7, 9])
    write_lines(HERE, "error_vs_mismatch.svg", "Mismatched observations defeat bundle adjustment",
                "Line plot of mean surface error against the fraction of mismatched observations for plain and Cauchy bundle adjustment from all-view and RANSAC starts",
                "mismatched observations (fraction)", "mean surface error (radii)",
                [("plain BA", xs, ys[0]), ("Cauchy BA", xs, ys[1]),
                 ("RANSAC init only", xs, ys[2]), ("RANSAC init + Cauchy BA", xs, ys[3])])


if __name__ == "__main__":
    main()
