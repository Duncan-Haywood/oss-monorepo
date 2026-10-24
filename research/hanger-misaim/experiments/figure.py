"""Write experiments/breakeven_vs_error.svg: break-even look time against detector error, from results.txt.

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
    xs, ys = table(TEXT, "== A.", 0, [1])
    write_lines(HERE, "breakeven_vs_error.svg",
                "How long may an opening detector take per pick, given how often it aims wrong?",
                "Line plot of the break-even detector time in seconds per pick against the share of wrong aims: about 9 s for a perfect detector, 4.5 s at 50 percent wrong, about 0 when every aim is wrong",
                "share of aims that are wrong (detector error)", "break-even detector time (s per pick, assumed times)",
                [("break-even look time T*", xs, ys[0])])


if __name__ == "__main__":
    main()
