"""Write experiments/hours.svg: cavern hydrogen and cavern air LCOS against discharge hours a year, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== D.", 0, [1, 2])
    write_lines(HERE, "hours.svg", "Long-duration storage cost against how often it is used",
                "Line plot: LCOS of cavern hydrogen and cavern compressed air against discharge hours a year at 280 hours duration; both fall about tenfold between 300 and 4,000 hours, and the zero-emission German system used hydrogen 719 hours",
                "discharge hours a year", "LCOS ($/MWh)", [("hydrogen", xs, ys[0]), ("cavern air", xs, ys[1])], logx=True, logy=True)


if __name__ == "__main__":
    main()
