"""Write experiments/battery.svg: self-sufficiency against battery size at 6 kW PV, from section B of results.txt.

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
    xs, ys = table(LINES, "B. ", 0, [1, 2])
    write_lines(HERE, "battery.svg", "Home solar: share of load met vs battery size (6 kW PV)",
                "Line plot: self-sufficiency and PV self-consumption of a 6 kW array on an 8,000 kWh/yr home "
                "rise steeply to about 15 kWh of battery and flatten beyond",
                "battery nameplate kWh", "share", [("self-sufficiency", xs, ys[0]), ("PV self-consumption", xs, ys[1])])


if __name__ == "__main__":
    main()
