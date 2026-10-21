"""Write experiments/lol.svg: loss of life against electrified share, from section F of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "F. ", 0, [1, 2])
    write_lines(HERE, "lol.svg", "Transformer loss of life vs heat-pump and EV share (Greensboro)",
                "Line plot: annual insulation loss of life in percent per year of a distribution transformer as the share of homes with a heat pump and an EV rises, "
                "for uncoordinated and smart EV charging",
                "share of homes with heat pump and EV, %", "loss of life, %/yr", [("uncoordinated charging", xs, ys[0]), ("smart charging", xs, ys[1])])


if __name__ == "__main__":
    main()
