"""Write experiments/wrong_twin.svg: size and power of the twin-informed test when the twin is wrong, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
EPS = 0.01


def main():
    xs, ys = table(TEXT, "== 5. Wrong twin", 0, [2, 3, 4])
    names = ["size at p=eps (want <= 0.05)", "power at eps/3", "power at eps/10"]
    write_lines(HERE, "wrong_twin.svg",
                "Twin-informed certification when the twin is wrong (w=0.01, n=400)",
                "Line plot of the size and power of the twin-informed certification test against how many times the true failure rate the twin claims; a twin claiming a failure rate far below the truth pushes the size to 0.24, almost five times the 0.05 target",
                "twin's claimed failure rate as a multiple of eps (lambda, log scale)", "probability",
                list(zip(names, [xs] * 3, ys)), logx=True, hline=0.05)


if __name__ == "__main__":
    main()
