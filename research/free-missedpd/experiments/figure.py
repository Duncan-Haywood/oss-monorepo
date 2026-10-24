"""Write experiments/miss_limits.svg: largest tolerable miss probability against twin pole radius r.

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
    xs, ys = table(TEXT, "r     q_meansquare", 0, [1, 2])
    write_lines(HERE, "miss_limits.svg", "PD loop: largest tolerable chance of a missed sample",
                "Line plot of the largest independent miss probability the loop tolerates, mean-square and almost-sure, against the twin's closed-loop pole radius r; the almost-sure limit is far above the mean-square one",
                "twin closed-loop pole radius r (higher = slower, gentler loop)", "largest miss probability q",
                [("mean-square stable", xs, ys[0]), ("almost surely stable", xs, ys[1])])


if __name__ == "__main__":
    main()
