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
    xs, ys = table(TEXT, "== U.", 0, [3, 4, 6, 7])
    write_lines(HERE, "error_vs_mismatch.svg", "An epipolar gate against random-pixel mismatches",
                "Line plot of mean surface error against the fraction of random-pixel mismatches, with and without the epipolar gate",
                "mismatched observations (fraction)", "mean surface error (radii)",
                [("Cauchy BA, all-view start", xs, ys[0]), ("Cauchy BA, RANSAC start", xs, ys[1]),
                 ("gate + plain BA", xs, ys[2]), ("gate + Cauchy BA", xs, ys[3])])


if __name__ == "__main__":
    main()
