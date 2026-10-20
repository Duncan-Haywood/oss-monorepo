"""Write experiments/figure.svg: reference and loop-detector AUROC by round per
feedback condition, parsed from results.txt (re-run run.py and report.py first).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE.parent / "results.txt").read_text().splitlines()
NAMES = ["blind", "detector explains (d2i)", "imitator shares code (i2d)", "both"]


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3, 4])
    write_lines(HERE, "figure.svg",
                "Cursor imitation game: loop detector AUROC on held-out people",
                "Line plot of the in-loop detector's AUROC on held-out people over 30 rounds for four "
                "feedback conditions; 0.5 means the detector cannot tell the imitator from people",
                "round", "AUROC (mean over seeds)", list(zip(NAMES, [xs] * 4, ys)), hline=0.5)


if __name__ == "__main__":
    main()
