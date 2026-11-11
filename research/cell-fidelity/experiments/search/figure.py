"""Write experiments/search/search.svg: median time to a design within 1% of the DFN best, against pool size.

    python experiments/search/figure.py

Numbers are parsed from the committed results.txt (section E), never retyped: re-run run.py first if it changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "E.", 0, [1, 2, 4, 5])
    names = ["GP-EI on DFN@100", "SPM@2 screen", "DFN@2 screen", "DFN@10 screen"]
    write_lines(HERE, "search.svg", "Time to a design within 1% of the DFN best, by candidate-pool size",
                "Line plot of median charged wall time to reach within 1% of the best 100-cycle DFN design against "
                "pool size: cheap whole-pool screens beat GP-EI on pools of 16 to 64 designs, GP-EI catches up by 96",
                "designs in the candidate pool", "median seconds to within 1% (30 seeds)",
                list(zip(names, [xs] * 4, ys)))


if __name__ == "__main__":
    main()
