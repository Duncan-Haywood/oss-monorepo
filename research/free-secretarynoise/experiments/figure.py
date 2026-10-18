"""Write experiments/pbest_vs_cutoff.svg: P(pick the best) against the cutoff, one line per noise level, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'pbest_vs_cutoff.svg', 'section': '3. P(best)', 'xcol': 0, 'ycols': [1, 3, 4, 5], 'names': ['noise 0', 'noise 0.5', 'noise 1', 'noise 2'], 'title': 'Noisy secretary problem, n = 50: P(pick the best) by cutoff', 'alt': 'Line plot of the probability of picking the best of 50 candidates against the cutoff r for four noise levels; every curve peaks near r = 16 to 19 and the peak falls from 0.37 with no noise to 0.07 at noise 2', 'xlabel': 'cutoff r (candidates skipped + 1)', 'ylabel': 'P(pick the true best)', 'logx': False, 'logy': False}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
