"""Write experiments/coverage.svg: share of a stylised population fitted by k sizes at rho = 0.9, parsed from results.txt.

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


def main():
    ks, cols = [], ([], [], [])
    for l in TEXT:
        m = re.match(r"\s+0\.9\s+(\d+) \| ([\d.]+)\s+([\d.]+)\s+([\d.]+) \|", l)
        if m:
            ks.append(int(m.group(1)))
            for c, v in zip(cols, m.groups()[1:]):
                c.append(float(v))
    if len(ks) != 6:
        raise SystemExit("expected 6 rows for rho 0.9, parsed %d" % len(ks))
    series = [(n, ks, c) for n, c in zip(["regular grid", "greedy", "exact"], cols)]
    write_lines(HERE, "coverage.svg", "Size run: share fitted by k sizes (rho 0.9, in-sample)",
                "Line plot of the share of a synthetic bust and hip population fitted within 4 centimetres by one to eight sizes, for a regular grid, a greedy choice and the exact optimum; the exact and greedy lines sit well above the grid",
                "number of sizes k", "share fitted", series)


if __name__ == "__main__":
    main()
