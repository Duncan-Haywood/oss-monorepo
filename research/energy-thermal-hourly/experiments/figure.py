"""Write experiments/floor.svg: store minus heat-pump cost of heat against the surplus-hour price floor (section E of results.txt).

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
    start = next(i for i, l in enumerate(LINES) if l.startswith("E. "))
    block = LINES[start:]
    series = []
    for case in ("daily", "weekly"):
        text = [block[0]] + [l for l in block[2:] if l.split()[1:2] == [case]]
        xs, ys = table(text, "E. ", 0, [6])
        series.append(("house, %s cycle" % case, xs, ys[0]))
    write_lines(HERE, "floor.svg", "Sand store minus heat pump: cost of heat against the surplus-hour price floor",
                "Line plot: levelised cost of heat from a house-sized sand store minus an air-source heat pump, in EUR per kWh, "
                "against the wholesale price paid in surplus-renewable hours, for daily and weekly cycling",
                "price in surplus hours (EUR/MWh)", "store minus heat pump (EUR/kWh); below 0 the store wins", series)


if __name__ == "__main__":
    main()
