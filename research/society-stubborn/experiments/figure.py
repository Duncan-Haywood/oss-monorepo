"""Write experiments/tipping_by_stubborn.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3])
    write_lines(HERE, "tipping_by_stubborn.svg", "Robot share that tips the crowd, by share of stubborn people",
                "Line plot of the mean-field tipping share of committed robots against the share of stubborn people, for memories of 5, 9 and 17 partners",
                "share of people who always walk right", "tipping robot share",
                [(f"memory {m}", xs, y) for m, y in zip((5, 9, 17), ys)])


if __name__ == "__main__":
    main()
