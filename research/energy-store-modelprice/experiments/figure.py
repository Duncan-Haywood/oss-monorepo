"""Write experiments/weekly.svg: store minus heat-pump cost of heat, house weekly cycling, by price source (section H).

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
    start = next(i for i, l in enumerate(LINES) if l.startswith("H. "))
    xs, ys = table(LINES[start:], "H. ", 0, [1, 2, 3])
    names = ("real price", "residual-load model", "model + oracle level")
    write_lines(HERE, "weekly.svg", "Weekly sand store minus heat pump on real and modelled prices (below zero: the store wins)",
                "Line plot: store minus heat-pump levelised cost of heat in EUR per kWh for a house-sized weekly-cycled sand store, "
                "German prices 2015 to 2019, on the real price and on a residual-load model fitted on the other four years",
                "year", "store minus heat pump (EUR/kWh)", [(n, xs, y) for n, y in zip(names, ys)])


if __name__ == "__main__":
    main()
