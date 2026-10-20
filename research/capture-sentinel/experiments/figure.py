"""Write experiments/miss.svg: sentinel miss rate against how strongly the subject favours one direction, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["best-placed sentinel", "worst-placed sentinel", "mean over the ring"]


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3])
    if len(xs) < 4:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "miss.svg", "Sentinel miss rate against how strongly the subject favours one direction",
                "Line plot: miss rate of the best-placed, worst-placed and average sentinel in a four-camera ring as the subject's facing concentrates on one direction",
                "concentration of facing (kappa; 0 = any direction)", "moments the sentinel misses",
                list(zip(NAMES, [xs] * 3, ys)))


if __name__ == "__main__":
    main()
