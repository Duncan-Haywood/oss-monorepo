"""Write experiments/min_stake.svg: minimum stake for unique honesty against the collusion discount, one line per replication factor, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'min_stake.svg', 'section': '== E1', 'xcol': 0, 'ycols': [1, 2, 3], 'names': ['k=2', 'k=3', 'k=4'], 'title': 'Replicated execution: minimum stake for unique honesty', 'alt': 'Line plot of the minimum stake, in units of the cheating gain, against the discount factor beta for 2, 3 and 4 replicas; the stake needed rises steeply with beta and falls with more replicas', 'xlabel': 'beta', 'ylabel': 'stake S / G'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
