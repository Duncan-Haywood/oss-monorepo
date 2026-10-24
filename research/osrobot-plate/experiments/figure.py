"""Write experiments/plate_time.svg: seconds to fill a 96-well plate against volume per well, parsed from results.txt.

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
    xs, ys = table(TEXT, "# Sweep 1", 0, [1, 2, 3, 4])
    names = ["gantry, 1 channel", "gantry, 8 channels", "arm, 1 channel", "arm, 8 channels"]
    write_lines(HERE, "plate_time.svg", "Time to fill a 96-well plate", "Line plot of seconds per plate against microlitres per well for a gantry and a two-link arm with 1 or 8 channels; channel count moves the time about sevenfold and the robot type 5 to 14 percent",
                "volume per well (uL)", "seconds per plate", list(zip(names, [xs] * 4, ys)), logx=True, logy=True)


if __name__ == "__main__":
    main()
