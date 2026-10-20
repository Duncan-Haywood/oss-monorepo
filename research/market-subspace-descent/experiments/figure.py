"""Write experiments/correlation_rate.svg: per-round convergence rate against security correlation, bound and exact, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'correlation_rate.svg', 'section': '1. Correlated', 'xcol': 0, 'ycols': [1, 2], 'names': ['bound 1-(1-c)/d', 'exact rate'], 'title': 'Market subspace descent: correlation slows single-security traders', 'alt': 'Line plot of the per-round contraction rate against the correlation c between securities; the exact rate stays below the bound and both approach 1 as c grows', 'xlabel': 'correlation c', 'ylabel': 'per-round rate'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
