"""Write experiments/threshold.svg, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== D.", 0, [1, 2, 3])
    write_lines(HERE, "threshold.svg", "Doorcost: collision cost above which yielding robots are stable",
                "Line plot of the threshold collision cost k star against the dithering cost d, for robot shares 10, 30 and 50 percent",
                "dithering cost d (waiting cost w = 1)", "threshold collision cost k*",
                [("10% robots", xs, ys[0]), ("30% robots", xs, ys[1]), ("50% robots", xs, ys[2])])


if __name__ == "__main__":
    main()
