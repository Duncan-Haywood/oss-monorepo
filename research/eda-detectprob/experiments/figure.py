"""Write experiments/miss_curve.svg: random-vector miss rate against budget, observed and geometric model.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run analyse.py first if the data changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== C.", 0, [1, 2])
    series = [(n, xs, y) for n, y in zip(["observed (20 seeds)", "geometric model"], ys)]
    write_lines(HERE, "miss_curve.svg", "Random-vector miss rate on detectable mutants",
                "Line plot of the share of detectable mutants that random vectors have not yet caught against the number of vectors, observed and from a geometric model; the two agree within 0.005",
                "random vectors (n)", "share of mutants missed", series, logy=False)


if __name__ == "__main__":
    main()
