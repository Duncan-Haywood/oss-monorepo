"""Write experiments/spare_ratio.svg: shared fleet cost relative to a robot per job, against unit availability.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (block 1, target 0.99), never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def block1(text):
    rows, on = [], False
    for l in text.splitlines():
        if l.startswith("1. "):
            on = True
        elif on and l[:2] in ("2.", "3."):
            break
        elif on:
            p = l.split()
            if len(p) == 13 and p[0].isdigit() and float(p[4]) == 0.99:
                rows.append((float(p[3]), float(p[10]), float(p[11]), float(p[12])))
    return sorted(rows)


def main():
    rows = block1((HERE / "results.txt").read_text())
    xs = [r[0] for r in rows]
    series = [("no spares", xs, [r[1] for r in rows]), ("spares per job", xs, [r[2] for r in rows]),
              ("spares, every job up at once", xs, [r[3] for r in rows])]
    write_lines(HERE, "spare_ratio.svg", "Spares favour sharing only when all jobs must run at once",
                "Line plot of the median cost of the cheapest shared fleet relative to a robot per job, against unit availability, with no spares, with spares per job, and with spares so every job is up at once",
                "unit availability", "shared cost / dedicated cost", series)


if __name__ == "__main__":
    main()
