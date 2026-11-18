"""Write experiments/fresh/fresh.svg: median time to a design within 1% of the DFN best, by pool size, on fresh designs.

    python experiments/fresh/figure.py

Numbers are parsed from the committed results.txt (section D), never retyped: re-run run.py report first if it changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["GP-EI on DFN@100", "SPM@100 screen", "DFN@2 screen", "SPMe@2 screen", "SPMe@10 screen", "cheap-start MF-UCB"]


def main():
    xs, ys = table(TEXT, "D. median T1", 0, [1, 2, 3, 4, 5, 6])
    write_lines(HERE, "fresh.svg", "128 fresh electrode designs: time to within 1% of the DFN best",
                "Line plot of median charged seconds against candidate pool size (16 to 96) for GP-EI on 100-cycle DFN "
                "and five cheap-first searches; the short SPMe screens stay near the fastest at every size, GP-EI is slowest",
                "candidate pool size", "median T1 (charged s)", list(zip(NAMES, [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
