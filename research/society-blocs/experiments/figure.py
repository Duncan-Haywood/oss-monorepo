"""Write experiments/tipping_by_left_bloc.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3])
    write_lines(HERE, "tipping_by_left_bloc.svg", "Robot share that tips the crowd, by share of stubborn people on the robots' side",
                "Line plot of the mean-field tipping share of committed robots against the share of people who always walk on the robots' side, for memories of 5, 9 and 17 partners",
                "share of people who always walk on the robots' side", "tipping robot share",
                [(f"memory {m}", xs, y) for m, y in zip((5, 9, 17), ys)])


if __name__ == "__main__":
    main()
