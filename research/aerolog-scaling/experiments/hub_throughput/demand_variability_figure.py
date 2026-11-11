"""Write demand_variability_tail.svg: share of orders waiting over 300 s against spare packs, cell1 at 85% load
(milestone 6l): the day-mixture rule R1 against the simulator with measured day-to-day variability.

    python3 demand_variability_figure.py

Numbers are parsed from the committed demand_variability_results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "demand_variability_results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== cell1, load 85%", 0, [1, 2], sep="|")
    write_lines(HERE, "demand_variability_tail.svg",
                "Cargo-drone hub, measured demand variability: P(wait > 300 s) against spare packs (85% load)",
                "Line plot of the share of orders waiting more than 300 s for a charged pack against the pack count, "
                "for a hub whose demand follows real day-to-day variation of Uber pickups in one Manhattan cell; the "
                "rule that treats each day on its own sits about 0.03 below the simulator, so it reaches the 0.05 "
                "target near 90 packs where the simulator needs 111",
                "spare packs S", "P(wait > 300 s)",
                [("day-mixture rule R1", xs, ys[0]), ("simulator (random observed days)", xs, ys[1])], hline=0.05)


if __name__ == "__main__":
    main()
