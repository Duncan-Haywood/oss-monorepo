"""Write experiments/layout.svg: net whole-body change of the shank and waist layouts against the shank/waist penalty ratio.

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
    xs, ys = table(TEXT, "Waist-layout net change (%) at gain 0.3", 0, [2, 3], 7)
    series = list(zip(["waist layout", "shank layout"], [xs] * len(ys), ys))
    write_lines(HERE, "layout.svg", "Net whole-body change by where the power train sits",
                "Line plot of net whole-body metabolic change in percent for a shank-mounted and a waist-mounted power train against the ratio of the per-kg penalty at the shank to that at the waist; the shank layout rises steeply",
                "shank/waist penalty ratio", "net whole-body change (%, negative = saving)", series)


if __name__ == "__main__":
    main()
