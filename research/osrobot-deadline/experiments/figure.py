"""Write experiments/deadline.svg: cheapest cost per hectare against deadline for 1.62 ha fields, parsed from results.txt (Sweep 2).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "# Sweep 2: cheapest fleet by deadline, 16 fields of 1.62", 0, [3, 5])
    write_lines(HERE, "deadline.svg", "Cheapest fleet cost per hectare by deadline, 1.62 ha fields (assumed prices)",
                "Line plot of cost per hectare for the cheapest scout-and-treater fleet and the cheapest inline fleet that finish sixteen 1.62 hectare fields by a deadline, from 12 to 48 hours; the pipeline is cheaper at every deadline it can meet",
                "deadline, hours", "USD per hectare",
                [("scout + treaters (up to 4 scouts)", xs, ys[0]), ("inline robots", xs, ys[1])])


if __name__ == "__main__":
    main()
