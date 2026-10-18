"""Write experiments/projects_per_day.svg: research projects created per UTC day, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import datetime
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text()


def main():
    rows = re.findall(r"^\s+(\d{4}-\d\d-\d\d)\s+(\d+)\s*$", TEXT, re.M)
    if not rows:
        raise SystemExit("no per-day rows in results.txt")
    d0 = datetime.date.fromisoformat(rows[0][0])
    xs = [float((datetime.date.fromisoformat(d) - d0).days) for d, _ in rows]
    ys = [float(c) for _, c in rows]
    write_lines(HERE, "projects_per_day.svg", "Research projects created per UTC day",
                f"Line plot of research projects created per day from {rows[0][0]} to {rows[-1][0]}; two bursts of output, on 2026-09-29 to 09-30 and 2026-10-13 to 10-14",
                f"days since {rows[0][0]}", "projects created", [("projects/day", xs, ys)])


if __name__ == "__main__":
    main()
