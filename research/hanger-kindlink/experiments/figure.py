"""Write experiments/knithidden.svg: cell output against the share of knits with a hidden opening, from results.txt.

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
    xs, ys1 = table(TEXT, "== B.", 0, [1])
    xs2, ys2 = table(TEXT, "== C.", 0, [1])
    write_lines(HERE, "knithidden.svg",
                "Does hiding knit openings slow a linked laundry cell?",
                "Line plot of garments hung or folded per hour against the chance a knit hides its opening, for one and two arms: both lines fall by about ten percent across the range, from 144 to 132 per hour on one arm and 239 to 230 on two",
                "chance a knit's opening is hidden (assumed)", "garments hung or folded per hour",
                [("1 arm", xs, ys1[0]), ("2 arms", xs2, ys2[0])])


if __name__ == "__main__":
    main()
