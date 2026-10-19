"""Write experiments/closure_by_week.svg: cost closure against weeks for four learning orders, parsed from results.txt.

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
    xs, ys = table(TEXT, "== cost closure (points) vs week", 0, [1, 2, 3, 4])
    series = list(zip(["optimal order", "lookahead rule", "budget-frontier order", "myopic rule"], [xs] * 4, ys))
    alt = (f"Line plot of cost closure points against weeks of capability learning for four orders: after {xs[-1]:.0f} weeks "
           f"the optimal order is at {ys[0][-1]:.0f} points, the budget-frontier order {ys[2][-1]:.0f}; the optimal order is ahead from the first weeks")
    write_lines(HERE, "closure_by_week.svg", "Selfrep-capsequence: cost closure by week for four learning orders", alt,
                "weeks of capability development (assumed efforts)", "cost closure gained (points)", series)


if __name__ == "__main__":
    main()
