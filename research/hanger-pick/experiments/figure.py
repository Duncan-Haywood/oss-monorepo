"""Write experiments/hidden_vs_time.svg: seconds per garment against the share of hidden openings, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'hidden_vs_time.svg', 'section': '== C2.', 'xcol': 0, 'ycols': [1, 2, 3],
       'names': ['pinch the top', 'aim at a visible opening', 'sweep, then aim'],
       'title': 'Picking from a tangled load: seconds per garment against the share of hidden openings',
       'alt': 'Line plot of assumed-time seconds per garment against the share of garments whose opening is hidden by the garment itself: pinching the top stays near 22.7 s, aiming at a visible opening rises from 7.3 s to 22.7 s, and sweeping first is slower than aiming at every share above zero',
       'xlabel': 'share of garments with the opening hidden', 'ylabel': 'seconds per garment (assumed times)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], list(zip(c["names"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
