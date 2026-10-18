"""Write experiments/adapt_linear.svg: held-out error of the linear cost model against designs from the new family.

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
    xs, ys = table(TEXT, "== S. linear", 0, [1, 2, 3])
    series = [(n, xs, y) for n, y in zip(["other families only", "new family only", "other + new family"], ys)]
    write_lines(HERE, "adapt_linear.svg", "Linear cost model on an unseen design family",
                "Line plot of median absolute percentage error against the number of synthesised designs from the new family, for three training sets; training on the new family alone overtakes pooling at about three designs",
                "synthesised designs from the new family (k)", "median error, % (median over 4 families)", series, logy=True)


if __name__ == "__main__":
    main()
