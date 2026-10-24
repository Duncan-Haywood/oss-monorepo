"""Write experiments/ventures_by_day.svg: share of landed ventures sessions that have a run record, per day, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = [re.sub(r"^(\s+)2026-10-(\d\d)", r"\1\2", l) for l in (HERE / "results.txt").read_text().splitlines()]


def main():
    xs, ys = table(TEXT, "== C.", 0, [2])
    write_lines(HERE, "ventures_by_day.svg", "Share of landed ventures sessions with a run record, by day of October 2026",
                "Line plot of the share of ventures sessions that put commits on main per day and also have a run record, rising from 53% on 14 October to about 84% to 89% on 18 and 19 October",
                "day of October 2026 (first commit on main)", "sessions with a record (%)", [("record present", xs, ys[0])])


if __name__ == "__main__":
    main()
