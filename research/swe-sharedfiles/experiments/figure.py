"""Write experiments/window_share.svg: share of shared-file merges with an earlier one inside the window, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("%", " ").splitlines()


def main():
    xs, ys = table(TEXT, "window (min)  share", 0, [1], 7)
    write_lines(HERE, "window_share.svg", "Shared-file merges: share with an earlier one inside the window",
                "Line plot of the share of shared-file merges that had an earlier shared-file merge within a window of 5 to 240 minutes; the share rises from 14 percent to 99 percent",
                "window (min)", "share of merges (%)", [("share with earlier merge", xs, ys[0])], logx=True)


if __name__ == "__main__":
    main()
