"""Write experiments/nail_share.svg: demand/capacity of the top-row nails against the share of them that act, from results.txt.

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
    xs, ys = table(TEXT, "== C.", 0, [1, 2])
    write_lines(HERE, "nail_share.svg", "Hung panel: nail demand/capacity vs share of top-row nails acting",
                "Line plot of the demand to capacity ratio of the sheathing-to-top-plate nails of the heaviest open and closed panel against the share of the nails that carry the load; the closed panel reaches ratio 1 near 40 percent",
                "share of top-row nails carrying the load", "demand / capacity",
                [("open panel", xs, ys[0]), ("closed panel", xs, ys[1])], hline=1.0)


if __name__ == "__main__":
    main()
