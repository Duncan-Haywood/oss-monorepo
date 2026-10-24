"""Write experiments/tmy.svg: break-even price against size for each forecast, from section C of results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "C. ", 0, [1, 2, 3, 4])
    write_lines(HERE, "tmy.svg", "Home battery on real weather (Golden CO): break-even price by forecast",
                "Line plot: break-even installed battery price in dollars per kWh against battery size on a measured-derived typical year for Golden, Colorado, "
                "for a fixed peak-discharge rule, a rolling optimiser fed yesterday's weather, one fed a clear-sky-index forecast, and one with a perfect forecast; "
                "both realistic forecasts fall below the fixed rule, far below the perfect forecast",
                "battery nameplate kWh", "break-even $/kWh (life-limited)",
                [("fixed rule (energy-tou)", xs, ys[0]), ("optimiser, yesterday's weather", xs, ys[1]),
                 ("optimiser, clear-sky-index forecast", xs, ys[2]), ("optimiser, perfect forecast", xs, ys[3])])


if __name__ == "__main__":
    main()
