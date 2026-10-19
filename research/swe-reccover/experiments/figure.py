"""Write experiments/cover_by_day.svg: share of landed sessions that have a run record, per day, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

# "  2026-10-16  335  83.0" -> "  16  335  83.0" so the day of October is the x value.
TEXT = [re.sub(r"^(\s+)2026-10-(\d\d)", r"\1\2", l) for l in (HERE / "results.txt").read_text().splitlines()]


def main():
    xs, ys = table(TEXT, "== C.", 0, [2])
    write_lines(HERE, "cover_by_day.svg", "Share of landed sessions with a run record, by day of October 2026",
                "Line plot of the share of sessions that put commits on main per day and also have a run record; about 60% on 13 and 14 October, 82% to 88% from 15 October",
                "day of October 2026 (first commit on main)", "sessions with a record (%)", [("record present", xs, ys[0])])


if __name__ == "__main__":
    main()
