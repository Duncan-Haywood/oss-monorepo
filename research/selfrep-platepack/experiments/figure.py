"""Write experiments/plate_size.svg: focus-policy doubling time by parts per plate, parsed from results.txt (section A).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("c=", "").splitlines()
NAMES = ["no changeover", "0.25 h per plate", "0.5 h per plate", "1 h per plate"]


def main():
    xs, ys = table(TEXT, "== A.", 0, [2, 3, 4, 5])
    series = list(zip(NAMES, [xs] * len(ys), ys))
    write_lines(HERE, "plate_size.svg", "Doubling time against parts per plate, pooled printers (stylised)",
                "Line plot of effective doubling time of a printer fleet against parts per print plate for four plate changeover times; with changeover the best plate holds several parts, without it one part per plate is best",
                "parts per plate", "effective doubling time (h)", series, logx=True)


if __name__ == "__main__":
    main()
