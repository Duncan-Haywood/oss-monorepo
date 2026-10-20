"""Write experiments/margin_vs_cutoff.svg: test P(best) of the tuned margin rule and the tuned cutoff rule against noise, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'margin_vs_cutoff.svg', 'section': 'sigma', 'xcol': 0, 'ycols': [6, 7], 'names': ['best cutoff', 'best margin rule'], 'title': 'Noisy secretary problem, n = 50: tuned margin rule vs tuned cutoff (fresh test draws)', 'alt': 'Line plot of the probability of picking the best of 50 candidates against noise level for the tuned cutoff rule and the tuned margin rule; the margin rule is higher by about 0.011 at noise 0.5 and the two converge by noise 2', 'xlabel': 'noise sd / quality sd', 'ylabel': 'P(pick the true best), test draws'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
