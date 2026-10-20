"""Write experiments/breakeven.svg: break-even battery price against battery size, from section B of results.txt.

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
    write_lines(HERE, "breakeven.svg", "Home battery: break-even installed price vs size (6 kW PV)",
                "Line plot: the installed battery price in dollars per kWh at which a home battery just pays, "
                "for an assumed time-of-use tariff with grid charging and for a flat tariff, falling as the battery grows",
                "battery nameplate kWh", "break-even $/kWh", [("time-of-use, peak dispatch + grid charge", xs, ys[0]), ("flat tariff, greedy", xs, ys[1])])


if __name__ == "__main__":
    main()
