"""Write experiments/error_vs_ratio.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [4, 5, 6])
    write_lines(HERE, "error_vs_ratio.svg", "Surface error under the SIFT mismatch mix measured at each ratio test",
                "Line plot of surface error in object radii against the ratio-test threshold for plain Cauchy, RANSAC-start Cauchy and gate-then-Cauchy bundle adjustment",
                "ratio-test threshold (0.9 loose, 0.6 tight)", "surface error (object radii)",
                [("Cauchy, no gate", xs, ys[0]), ("RANSAC start + Cauchy", xs, ys[1]), ("epipolar gate + Cauchy", xs, ys[2])])


if __name__ == "__main__":
    main()
