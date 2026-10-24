"""Write experiments/energy.svg: rig energy against number of cameras, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["independent", "sentinel + sleepers", "any-of-N + standby", "continuous"]


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 4, 5])
    if len(xs) < 4:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "energy.svg", "Rig energy against number of cameras",
                "Line plot: watt-hours a rig uses over a 16 hour day with independent triggers, a sentinel with sleeping cameras, any-camera wake, and continuous recording, as cameras are added",
                "cameras in the rig", "rig energy over 16 h (Wh)",
                list(zip(NAMES, [xs] * 4, ys)))


if __name__ == "__main__":
    main()
