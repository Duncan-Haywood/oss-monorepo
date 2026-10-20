"""Write experiments/gold_rate_effort.svg: equilibrium effort against gold-check rate, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run the experiment first if it changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").replace(":", " ").replace("(", " ").splitlines()
CFG = {'fname': 'gold_rate_effort.svg', 'section': 'E5.', 'xcol': 1, 'ycols': [3], 'names': ['equilibrium effort e'], 'title': 'Peer prediction: gold checks lift effort below the stability threshold (alpha = 0.7 alpha0)', 'alt': 'Line plot of the unique equilibrium effort against the gold-check rate r; effort is zero at r=0 and rises steadily as the rate grows to 0.4', 'xlabel': 'gold-check rate r', 'ylabel': 'equilibrium effort e'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
