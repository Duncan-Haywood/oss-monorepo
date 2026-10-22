"""Write experiments/tables.svg: dryers served against fold tables, from results.txt (section E).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== E.", 0, [1, 2, 3, 4])
    write_lines(HERE, "tables.svg",
                "How many fold tables does a laundry cell need at published robot folding speeds?",
                "Line plot of dryers served against the number of fold tables for four SpeedFolding fold times: lines rise with each added table and flatten near eight dryers once the two arms are the limit; reaching five dryers takes three to ten tables depending on the fold time",
                "fold tables (two arms)", "dryers served",
                [(n, xs, ys[i]) for i, n in enumerate(("towel 68 s", "fling-to-fold 88 s", "t-shirt 117 s", "max-value map 167 s"))])


if __name__ == "__main__":
    main()
