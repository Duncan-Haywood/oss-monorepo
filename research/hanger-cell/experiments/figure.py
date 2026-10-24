"""Write experiments/pick_vs_throughput.svg: cell throughput against the pick success rate, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'pick_vs_throughput.svg', 'section': '== E.', 'xcol': 0, 'ycols': [1],
       'names': ['items per hour, one arm'],
       'title': 'Laundry cell: items per hour against the pick success rate',
       'alt': 'Line plot of one-arm cell throughput against the probability a pick succeeds: about 138 items per hour at 0.50, 169 at 0.85 and 181 at 0.99',
       'xlabel': 'probability one pick succeeds', 'ylabel': 'items per hour'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], list(zip(c["names"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
