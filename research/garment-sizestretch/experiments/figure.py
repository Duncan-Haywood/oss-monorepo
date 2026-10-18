"""Write experiments/coverage.svg: share fitted by k sizes at several stretch levels (rho = 0.5), parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
KS = [1, 2, 3, 4, 6, 8]


def main():
    rows, on = {}, False
    for l in TEXT:
        if l.startswith("A. rho"):
            on = "rho = 0.5" in l
        m = re.match(r"\s+(\d+)%\s+\| ([\d.\s]+)$", l)
        if on and m:
            vals = [float(x) for x in m.group(2).split()]
            if len(vals) == len(KS):
                rows[int(m.group(1))] = vals
    if len(rows) != 5:
        raise SystemExit("expected 5 stretch rows at rho 0.5, parsed %d" % len(rows))
    series = [(f"stretch {s}%", KS, v) for s, v in sorted(rows.items()) if s in (0, 5, 10, 20)]
    write_lines(HERE, "coverage.svg", "Share fitted by k sizes at four stretch levels (rho 0.5, in-sample)",
                "Line plot of the share of a synthetic bust and hip population fitted by one to eight sizes, for fabric stretch of 0, 5, 10 and 20 percent; more stretch lifts the whole curve, and 20 percent fits nearly everyone with three sizes",
                "number of sizes k", "share fitted", series)


if __name__ == "__main__":
    main()
