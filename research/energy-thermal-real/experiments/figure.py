"""Write experiments/real.svg: store minus heat-pump cost of heat by year on real day-ahead prices (section C of results.txt).

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
    start = next(i for i, l in enumerate(LINES) if l.startswith("C. "))
    block = LINES[start:]
    series = []
    for case in ("daily", "weekly"):
        text = [block[0]] + [l for l in block[2:] if l.split()[:2] == ["house", case]]
        xs, ys = table(text, "C. ", 2, [7])
        series.append(("house, %s cycle" % case, xs, ys[0]))
    write_lines(HERE, "real.svg", "Sand store minus heat pump: cost of heat on real German day-ahead prices, 2015-2019",
                "Line plot: levelised cost of heat from a house-sized sand store minus an air-source heat pump, in EUR per kWh, "
                "for each year 2015 to 2019, for daily and weekly cycling, with the store buying the cheapest quarter of hours",
                "year", "store minus heat pump (EUR/kWh); below 0 the store wins", series)


if __name__ == "__main__":
    main()
