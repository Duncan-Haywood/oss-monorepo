"""Write experiments/learn_curve.svg: closure gained by learning the k best vitamin lines, parsed from results.txt.

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
    xs, ys = table(TEXT, "== cumulative closure", 0, [1, 2, 3])
    series = list(zip(["unit closure gained", "mass closure gained", "cost closure gained"], [xs] * 3, ys))
    alt = (f"Line plot of closure points gained against the number of vitamin lines learned, best first: after 10 lines "
           f"units {ys[0][-1]:.0f}, mass {ys[1][-1]:.0f} and cost {ys[2][-1]:.0f} points")
    write_lines(HERE, "learn_curve.svg", "Selfrep-learnfirst: closure gained by learning k vitamin lines", alt,
                "vitamin lines learned (best first for each metric)", "closure points gained", series)


if __name__ == "__main__":
    main()
