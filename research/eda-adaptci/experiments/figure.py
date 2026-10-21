"""Write experiments/gap_spread.svg: the spread-minus-random error gap with its bootstrap interval.

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
    series = []
    for kind in ("linear", "ridge"):
        xs, ys = table(TEXT, f"== {kind}, spread vs random", 0, [1, 2, 3])
        series += [(f"{kind}: median gap", xs, ys[0]), (f"{kind}: 95% low", xs, ys[1]), (f"{kind}: 95% high", xs, ys[2])]
    write_lines(HERE, "gap_spread.svg", "Spread minus random error, with 95% bootstrap interval (weight 5)",
                "Line plot of the median gap in percentage points of absolute percentage error between the farthest-point spread and random draws against the number of synthesised designs k, with interval bounds, for the linear and ridge models; negative means the spread is better, and the ridge interval is above zero at k = 3",
                "synthesised designs from the new family (k)", "spread minus random, percentage points", series, hline=0)


if __name__ == "__main__":
    main()
