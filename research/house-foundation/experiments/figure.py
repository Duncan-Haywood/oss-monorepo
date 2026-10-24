"""Write experiments/cost_by_frost.svg: midpoint first cost of each foundation against frost depth, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace(",", "").splitlines()
CFG = {'fname': 'cost_by_frost.svg', 'section': 'B. Midpoint', 'xcol': 0, 'ycols': [1, 2, 3, 4],
       'names': ['slab on grade', 'frost-protected shallow', 'crawlspace', 'full basement'],
       'title': 'Foundation first cost by frost depth (28 x 40 ft house, stylised prices)',
       'alt': 'Line plot of midpoint first cost in dollars against frost depth in inches for four foundations: the full basement is flat near $55,000, the slab and crawlspace rise with frost depth, and the frost-protected shallow foundation stays near $13,000',
       'xlabel': 'frost depth (in)', 'ylabel': 'first cost (USD)', 'maxrows': 5}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
