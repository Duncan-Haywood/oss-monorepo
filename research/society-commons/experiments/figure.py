"""Write experiments/load.svg and experiments/share.svg from results.txt.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
FIGS = [
    {'fname': 'load.svg', 'section': '== B.', 'ycols': [1, 2, 3, 4],
     'names': ['people wait, first come first served', 'people wait, robots defer', 'robots wait, first come first served', 'robots wait, robots defer'],
     'title': 'Mean wait at a shared one-at-a-time crossing, by load',
     'alt': 'Line plot of mean wait against load; at load 0.95 people wait 9.8 time units when everyone is served in order of arrival and 0.8 when robots always defer, while robots wait 9.9 and 15.9',
     'xlabel': 'load on the crossing (share of time it is busy)', 'ylabel': 'mean wait before crossing (time units)'},
    {'fname': 'share.svg', 'section': '== C.', 'ycols': [1, 2],
     'names': ['people', 'robots (all)'],
     'title': 'Mean wait at load 0.9, by share of robots that defer',
     'alt': 'Line plot of mean wait against the share of deferential robots at load 0.9; people wait falls from 4.6 to 0.7 time units as the share rises from 0 to 1, robot wait rises from 4.6 to 7.2',
     'xlabel': 'share of robots that let waiting people go first', 'ylabel': 'mean wait before crossing (time units)'},
]


def main():
    for c in FIGS:
        xs, ys = table(TEXT, c["section"], 0, c["ycols"])
        series = list(zip(c["names"], [xs] * len(ys), ys))
        write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
