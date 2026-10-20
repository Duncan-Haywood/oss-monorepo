"""Write experiments/pick_linear.svg: held-out error of the pooled linear cost model by how the adaptation designs are chosen.

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
    xs, ys = table(TEXT, "== S. linear, w=5", 0, [1, 2, 3, 4])
    series = [(n, xs, y) for n, y in zip(["random draw", "smallest first", "farthest-point spread", "extremes then spread"], ys)]
    write_lines(HERE, "pick_linear.svg", "Choosing which designs to synthesise (linear model, new-family weight 5)",
                "Line plot of median absolute percentage error against the number of synthesised designs from the new family, for four ways of choosing them; the farthest-point spread is lowest from three designs on and choosing the smallest designs is worst",
                "synthesised designs from the new family (k)", "median error, % (median over 4 families)", series, logy=True)


if __name__ == "__main__":
    main()
