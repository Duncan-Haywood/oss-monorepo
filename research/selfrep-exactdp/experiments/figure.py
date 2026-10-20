"""Write experiments/gain_vs_resolution.svg: certified DP value as a percentage of the best bang-bang switch, against control resolution m.

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
CASES = [("c=10000, s=0", "c = 1e4, s = 0"), ("c=1000, s=0", "c = 1e3, s = 0"), ("c=10000, s=12.5", "c = 1e4, s = 12.5")]


def main():
    series = []
    for key, name in CASES:
        i = next(k for k, l in enumerate(TEXT) if l.startswith("== " + key + ":"))
        xs, ys = [], []
        for l in TEXT[i + 1:]:
            m = re.match(r"\s*m=(\d+):.*table/J_bb=\s*([0-9.]+)%", l)
            if not m:
                break
            xs.append(float(m.group(1)))
            ys.append(float(m.group(2)))
        series.append((name, xs, ys))
    alt = ("Line plot of the exact dynamic-programming optimum as a percentage of the best bang-bang switch, against the number of "
           "control levels per growth step m, for three market cases; the lines rise from 100 percent to between 104.7 and 107.1 percent and flatten")
    write_lines(HERE, "gain_vs_resolution.svg", "Selfrep-exactdp: DP optimum vs best switch", alt,
                "control resolution m (levels per growth step)", "DP value / best switch (%)", series, logx=True, hline=100.0)


if __name__ == "__main__":
    main()
