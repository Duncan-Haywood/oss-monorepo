"""Write experiments/energy.svg: energy of a 16 h day against interesting moments per hour, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["continuous", "sleep + trigger", "standby + pre-roll"]


def main():
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3])
    if len(xs) < 3:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "energy.svg", "Energy of a 16 h day against event rate",
                "Line plot: watt-hours used by continuous, sleep-and-trigger and standby-with-pre-roll recording as interesting moments per hour rise",
                "interesting moments per hour", "energy over 16 h (Wh)",
                list(zip(NAMES, [xs] * 3, ys)))


if __name__ == "__main__":
    main()
