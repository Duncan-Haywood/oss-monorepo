"""Write experiments/rmse.svg: leave-one-year-out RMSE of five price models (section F of results.txt).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    start = next(i for i, l in enumerate(LINES) if l.startswith("F. "))
    xs, ys = table(LINES[start:], "F. ", 0, [1, 2, 3, 4, 5])
    names = ("constant mean", "flat merit order", "hour-of-day mean", "residual load (fitted)", "residual load + oracle level")
    write_lines(HERE, "rmse.svg", "Price model error on a held-out year: residual load against the flat merit-order price",
                "Line plot: root-mean-square error in EUR per MWh of five hourly price models on German day-ahead prices, "
                "each fitted on the other four years 2015 to 2019 and tested on the held-out year",
                "held-out year", "RMSE (EUR/MWh); lower is better", [(n, xs, y) for n, y in zip(names, ys)])


if __name__ == "__main__":
    main()
