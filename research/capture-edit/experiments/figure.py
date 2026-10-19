"""Write experiments/quality.svg: true quality of the chosen camera against detector noise, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["fixed cut 3 s", "fixed cut 6 s", "greedy per frame", "hold rule", "viterbi", "oracle (true scores)"]


def main():
    xs, ys = table(TEXT, "== A.", 0, list(range(1, 7)))
    if len(xs) < 3:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "quality.svg", "Edit quality against detector noise",
                "Line plot: mean true quality of the camera chosen by each edit policy as the angle detector gets noisier",
                "detector noise (sigma)", "mean true quality of chosen camera",
                list(zip(NAMES, [xs] * 6, ys)))


if __name__ == "__main__":
    main()
