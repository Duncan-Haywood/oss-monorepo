"""Write experiments/lookhidden.svg: cell output against look time per hidden-opening share, from results.txt.

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
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3, 4, 5])
    write_lines(HERE, "lookhidden.svg",
                "How much does a slower look cost a one-arm laundry cell?",
                "Line plot of garments hung or folded per hour against the opening detector look time in seconds, one line for each share of garments with a hidden opening: output falls from about 185 per hour with no look and no hidden openings to about 100 with a 6 second look and 80 percent hidden",
                "look time before each aimed grasp (s, assumed)", "garments hung or folded per hour (one arm)",
                [("%d%% hidden" % h, xs, ys[i]) for i, h in enumerate((0, 20, 40, 60, 80))])


if __name__ == "__main__":
    main()
