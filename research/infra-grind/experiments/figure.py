"""Write experiments/circuit.svg: energy of a closed circuit relative to open, against classifier cut, from section D of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "D. ", 0, [2], maxrows=8)
    write_lines(HERE, "circuit.svg", "Closed-circuit energy relative to open circuit",
                "Line plot: ball-mill energy per tonne of fresh feed in a closed circuit divided by the open-circuit energy for the same 100 micrometre P80, against the classifier cut size as a multiple of P80",
                "classifier cut / P80", "energy relative to open circuit",
                [("closed / open", xs, ys[0])])


if __name__ == "__main__":
    main()
