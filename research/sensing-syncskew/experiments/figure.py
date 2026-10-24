"""Write experiments/error_vs_skew.svg from the committed results.txt (never retyped).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "## B.", 0, [2, 3, 4], sep="|")
    write_lines(HERE, "error_vs_skew.svg", "Attitude error against camera clock skew (synthetic)",
                "Line plot of the rms attitude error of a gyro-camera complementary filter against camera clock skew in parts per million, "
                "with no correction, a fixed-offset fit and an offset-plus-skew fit; the first two rise with skew and the last stays flat near 0.155 degrees",
                "camera clock skew (ppm)", "rms angle error (deg)",
                [("no correction", xs, ys[0]), ("fixed-offset fit", xs, ys[1]), ("offset + skew fit", xs, ys[2])])


if __name__ == "__main__":
    main()
