"""Write experiments/error_vs_offset.svg: fused attitude error against camera-to-gyro time offset.

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
    xs, ys = table(TEXT, "## A.", 0, [2, 6])
    write_lines(HERE, "error_vs_offset.svg", "Attitude error against camera time offset (synthetic)",
                "Line plot of the rms attitude error of a gyro-camera complementary filter against the camera timestamp offset in milliseconds, "
                "and the first-order omega times offset line; the error rises from 0.15 degrees at no offset past 1.5 degrees at 80 ms",
                "camera time offset (ms)", "rms angle error (deg)",
                [("simulated filter", xs, ys[0]), ("omega_rms x offset", xs, ys[1])])


if __name__ == "__main__":
    main()
