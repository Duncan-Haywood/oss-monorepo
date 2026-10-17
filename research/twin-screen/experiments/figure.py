"""Write experiments/value_vs_shortlist.svg: value of the chosen design against shortlist size, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'value_vs_shortlist.svg', 'section': '== E1', 'xcol': 0, 'ycols': [2, 3, 4, 5], 'names': ['rho = 0.3', 'rho = 0.6', 'rho = 0.8', 'rho = 0.95'], 'title': 'Twin screening: value of the chosen design vs shortlist size (K=50, B=20)', 'alt': 'Line plot of the true value of the design finally chosen against the number m of twin-shortlisted designs verified on the real plant, for four twin correlations: each curve rises then falls, and the best shortlist is smaller for a better twin', 'xlabel': 'shortlist size m (log scale)', 'ylabel': 'true value of chosen design (sd)', 'logx': True, 'logy': False}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series, logx=c["logx"], logy=c["logy"])


if __name__ == "__main__":
    main()
