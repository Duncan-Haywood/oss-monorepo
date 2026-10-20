"""Write experiments/slip_shift.svg: activity accuracy under garment slip, trained clean vs trained with slip, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (section C), never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    # rows look like: "test slip 0.3 rad: train-clean  81.0 +-  3.4 | train-slip0.6  98.6 +-  0.8"
    xs, ys = table(TEXT, "## C.", 2, [5, 10])
    write_lines(HERE, "slip_shift.svg", "Smart garment: accuracy when the garment slips",
                "Line plot of activity-classification accuracy against test-time garment slip; a classifier trained without slip falls from 99.9 to 45 percent at 1 radian while one trained with slip stays above 94 percent",
                "test-time garment slip (rad)", "accuracy (%)",
                [("train clean", xs, ys[0]), ("train with slip 0.6", xs, ys[1])])


if __name__ == "__main__":
    main()
