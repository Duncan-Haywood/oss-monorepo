"""Write experiments/time_to_fleet.svg: deterministic time to reach each fleet size, parsed from results.txt (section B).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["whole copy per printer", "pooled, focus", "pooled, spread"]


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3])
    series = list(zip(NAMES, [xs] * len(ys), ys))
    write_lines(HERE, "time_to_fleet.svg", "Hours to reach a fleet size, no import limit (stylised, no noise)",
                "Line plot of hours to grow a printer fleet from 1 to 64 under three job-assignment policies; the focus policy is about 40 hours ahead at 64 printers, whole-copy and spread coincide",
                "fleet size (printers)", "hours", series, logx=True)


if __name__ == "__main__":
    main()
