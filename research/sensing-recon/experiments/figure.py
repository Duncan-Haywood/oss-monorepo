"""Write experiments/completeness_vs_views.svg: share of surface features reconstructed against number of views, from results.txt.

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
    xs, ys = table(TEXT, "== A.", 0, [3])
    write_lines(HERE, "completeness_vs_views.svg", "Surface features reconstructed, against number of views",
                "Line plot of the share of 800 synthetic surface features that were triangulated against the number of views on a full orbit; two views give none, eight give about 0.9 and twelve give all",
                "views on a 360 degree orbit", "share reconstructed",
                [("0.5 px noise", xs, ys[0])], logx=True)


if __name__ == "__main__":
    main()
