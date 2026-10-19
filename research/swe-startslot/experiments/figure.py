"""Write experiments/errors_by_day.svg: share of runs recording an error per day, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "   by calendar day", 0, [1])
    write_lines(HERE, "errors_by_day.svg", "Share of runs recording an error, by day",
                "Line plot of the share of run records with an error against the day of October 2026: about 0.47 to 0.50 on 13 to 15 October, then 0.06 to 0.09 from 16 October",
                "day of October 2026", "share of runs with an error", [("error share", xs, ys[0])])


if __name__ == "__main__":
    main()
