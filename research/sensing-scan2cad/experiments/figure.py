"""Write experiments/usable_vs_points.svg: fraction of scans giving a usable part against point count, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== H.", 0, [1, 2, 3])
    write_lines(HERE, "usable_vs_points.svg", "Scans within 0.2 mm on every dimension, against point count",
                "Line plot of the fraction of synthetic plate scans that fit within 0.2 mm on all five dimensions against the number of scan points, for three noise levels; low noise is always usable, 0.5 mm noise never exceeds 0.5",
                "scan points", "usable fraction",
                [("noise 0.1 mm", xs, ys[0]), ("noise 0.2 mm", xs, ys[1]), ("noise 0.5 mm", xs, ys[2])], logx=True)


if __name__ == "__main__":
    main()
