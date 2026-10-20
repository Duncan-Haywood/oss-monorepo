"""Write experiments/merge_within.svg: share of research branches merged within N minutes of their first commit.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text()


def main():
    rows = re.findall(r"branch merged within\s+(\d+) min of its first commit:\s+(\d+)/(\d+)", TEXT)
    if not rows:
        raise SystemExit("no 'merged within' rows in results.txt")
    xs = [float(m) for m, _, _ in rows]
    ys = [100 * int(a) / int(b) for _, a, b in rows]
    n = rows[0][2]
    write_lines(HERE, "merge_within.svg", f"Research branches: share merged within N minutes (n={n})",
                "Line plot of the cumulative percentage of research pull-request branches merged within 5 to 240 minutes of their first commit; most merge within 5 minutes",
                "minutes since first commit", "% of branches merged", [("branches merged", xs, ys)], logx=True)


if __name__ == "__main__":
    main()
