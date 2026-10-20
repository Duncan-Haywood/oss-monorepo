"""Write experiments/gap_by_cost.svg: mean ABC gap above the exact minimum against exact cost, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [2, 3, 4])
    names = ["Yosys default", "resyn2 then map", "3x resyn2, dch, map"]
    write_lines(HERE, "gap_by_cost.svg", "Gates above the exact minimum, by exact cost",
                "Line plot of the mean number of 2-input gates Yosys/ABC uses above the proven minimum, for 4-input functions "
                "grouped by their exact minimum gate count; the gap is zero up to two gates and about one to two and a half gates above that",
                "exact minimum gates", "mean gates above minimum", list(zip(names, [xs] * 3, ys)))


if __name__ == "__main__":
    main()
