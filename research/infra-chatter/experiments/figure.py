"""Write experiments/chart.svg: zero-order against semi-discretised depth limit, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== E.", 0, [1, 2])
    write_lines(HERE, "chart.svg", "Up-milling at 10% immersion: depth limit by spindle speed",
                "Line plot of the zero-order and semi-discretised depth-of-cut limits against spindle speed for 10 percent up-milling; the zero-order curve overshoots the semi-discretised one in places",
                "spindle speed (rpm)", "depth limit (mm)", [("zero-order", xs, ys[0]), ("semi-discretisation", xs, ys[1])])


if __name__ == "__main__":
    main()
