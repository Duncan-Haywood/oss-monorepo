"""Write experiments/search.svg: best score against evaluations for each proposer, from section A of results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py report first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "A. ", 0, [1, 3, 5])
    series = [(n, xs, y) for n, y in zip(["random (mean of 5)", "Bayesian (mean of 5)", "session agent (1 run)"], ys)]
    write_lines(HERE, "search.svg", "Best cell found vs evaluations (modelled, stack level)",
                "Line plot: best Wh per kg at cycle 100 against number of PyBaMM evaluations for three proposers",
                "evaluations", "best Wh/kg at cycle 100", series)


if __name__ == "__main__":
    main()
