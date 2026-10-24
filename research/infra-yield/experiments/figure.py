"""Write experiments/cost.svg: cost per good die against die area, from section C of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "C. ", 0, [3, 5])
    write_lines(HERE, "cost.svg", "Cost per good die against die area",
                "Line plot: USD per good die against die area in mm2 for a 7nm-class wafer (9,346 USD, D0 0.09) and a 5nm-class wafer (16,988 USD, D0 0.11), negative binomial yield",
                "die area, mm2", "USD per good die",
                [("7nm-class", xs, ys[0]), ("5nm-class", xs, ys[1])])


if __name__ == "__main__":
    main()
