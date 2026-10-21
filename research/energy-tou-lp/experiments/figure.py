"""Write experiments/breakeven.svg: break-even battery price against size, from section C of results.txt.

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
    xs, ys = table(LINES, "C. ", 0, [1, 2, 4])
    write_lines(HERE, "breakeven.svg", "Home battery: break-even price, optimiser vs fixed rule (6 kW PV)",
                "Line plot: the installed battery price in dollars per kWh at which a home battery just pays on an assumed "
                "time-of-use tariff, for an optimal dispatch with perfect foresight, a fixed peak-discharge rule, and a flat tariff, "
                "falling as the battery grows",
                "battery nameplate kWh", "break-even $/kWh (life-limited)",
                [("optimal dispatch (LP, perfect foresight)", xs, ys[0]), ("fixed rule (energy-tou)", xs, ys[1]), ("flat tariff, greedy", xs, ys[2])])


if __name__ == "__main__":
    main()
