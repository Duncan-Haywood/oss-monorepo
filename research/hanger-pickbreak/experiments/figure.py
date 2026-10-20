"""Write experiments/breakeven_vs_hidden.svg: break-even look time against the share of hidden openings, from results.txt.

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
    xs, ys = table(TEXT, "== D.", 0, [1])
    write_lines(HERE, "breakeven_vs_hidden.svg",
                "How long may an opening detector take per pick before a blind pinch is faster?",
                "Line plot of the break-even detector time in seconds per pick against the share of garments whose opening is hidden by the garment: about 15 s with none hidden, 9 s at 40 percent, falling to 0 when all are hidden",
                "share of garments with the opening hidden", "break-even detector time (s per pick, assumed times)",
                [("break-even look time T*", xs, ys[0])])


if __name__ == "__main__":
    main()
