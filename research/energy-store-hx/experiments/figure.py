"""Write experiments/breakeven.svg: break-even exchanger price by price year (weekly and daily, 45 C sink; results.txt).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, w = table(LINES, "# House, weekly", 0, [3])
    _, d = table(LINES, "# House, daily", 0, [3])
    series = [("weekly cycling", xs, w[0]), ("daily cycling", xs, d[0])]
    write_lines(HERE, "breakeven.svg", "Break-even price of the store's heat exchanger (house, 45 C sink)",
                "Line plot: the exchanger price in euro per kW of peak discharge at which the sand store stops beating an "
                "air-source heat pump, for each German price year 2015 to 2019, weekly and daily cycling",
                "price year", "break-even EUR per kW of peak discharge", series)


if __name__ == "__main__":
    main()
