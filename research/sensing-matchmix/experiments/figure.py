"""Write experiments/error_vs_rate.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [2, 3, 4, 5])
    write_lines(HERE, "error_vs_rate.svg", "Mismatch rate with the measured ratio-0.7 mix",
                "Line plot of mean surface error against mismatch rate for the measured SIFT ratio 0.7 mix of along, near and far mismatches, with and without the epipolar gate",
                "mismatched observations (fraction)", "mean surface error (radii)",
                [("Cauchy BA, all-view start", xs, ys[0]), ("Cauchy BA, RANSAC start", xs, ys[1]),
                 ("gate + Cauchy BA", xs, ys[2]), ("gate + RANSAC start + Cauchy BA", xs, ys[3])])


if __name__ == "__main__":
    main()
