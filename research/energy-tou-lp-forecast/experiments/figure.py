"""Write experiments/forecast.svg: break-even price against size for each forecast, from section B of results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "B. ", 0, [1, 2, 3, 4])
    write_lines(HERE, "forecast.svg", "Home battery: break-even price by forecast quality (6 kW PV)",
                "Line plot: break-even installed battery price in dollars per kWh against battery size for a fixed peak-discharge rule, "
                "a rolling optimiser fed a seven-day-mean forecast, one fed yesterday's weather, and one with a perfect forecast; "
                "the two realistic forecasts fall close to the fixed rule, far below the perfect forecast",
                "battery nameplate kWh", "break-even $/kWh (life-limited)",
                [("fixed rule (energy-tou)", xs, ys[0]), ("optimiser, 7-day-mean forecast", xs, ys[1]),
                 ("optimiser, yesterday's weather", xs, ys[2]), ("optimiser, perfect forecast", xs, ys[3])])


if __name__ == "__main__":
    main()
