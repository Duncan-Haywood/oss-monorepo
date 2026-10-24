"""Write experiments/fill_by_date.svg: share of run records carrying pr, cost_usd and wall_minutes per day, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

# "  2026-10-16  253 88.9 ..." -> "  16  253 88.9 ..." so the day of October is the x value; heading rows start with letters.
TEXT = [re.sub(r"^(\s+)2026-10-(\d\d)", r"\1\2", l) for l in (HERE / "results.txt").read_text().splitlines() if not l.startswith("  2026-10-01 ")]  # one stray record on 1 October


def main():
    xs, ys = table(TEXT, "== D.", 0, [2, 3, 5])
    series = list(zip(["pr named", "cost_usd", "wall_minutes"], [xs] * len(ys), ys))
    write_lines(HERE, "fill_by_date.svg", "Share of run records with each field filled, by day of October 2026",
                "Line plot of the share of run records per day that name a pull request, carry a cost and carry a wall time; cost and wall time rise from near zero on 13 to 15 October to over 80% on 19 October",
                "day of October 2026 (record date)", "records with field filled (%)", series)


if __name__ == "__main__":
    main()
