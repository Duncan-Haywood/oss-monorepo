"""Write experiments/error_vs_focal_error.svg from results.txt (never retyped numbers).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [2, 3, 4])
    write_lines(HERE, "error_vs_focal_error.svg", "Solving for the focal length removes the cost of a wrong EXIF value",
                "Line plot of mean surface error against the relative error of the told focal length: with the focal fixed the error grows, with the focal solved for it stays at the true-intrinsics floor",
                "told focal length error (relative)", "mean surface error (radii)",
                [("focal held at told value", xs, ys[0]), ("focal solved for", xs, ys[1]), ("true focal held", xs, ys[2])])


if __name__ == "__main__":
    main()
