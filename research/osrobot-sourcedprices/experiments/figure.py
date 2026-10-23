"""Write experiments/breakeven.svg: total cost per hectare against the ground-platform price (Sweep 2).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "# Sweep 2: break-even ground price", 0, [1, 2])
    write_lines(HERE, "breakeven.svg", "Total cost per hectare by ground-platform price, 1.62 ha fields, sourced 609 USD drone",
                "Line plot of total cost per hectare for the best scout-and-treater fleet and the best inline fleet as the price of the ground platform rises from 1,500 to 9,000 US dollars; the lines cross near 4,500 dollars",
                "ground platform price, USD", "USD per hectare",
                [("scout + treaters", xs, ys[0]), ("inline robots", xs, ys[1])])


if __name__ == "__main__":
    main()
