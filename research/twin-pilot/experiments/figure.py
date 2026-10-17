"""Write experiments/pwrong.svg: probability of a wrong twin-or-not decision against true correlation, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").replace("%", " ").splitlines()
CFG = {'fname': 'pwrong.svg', 'section': '  P(wrong):', 'xcol': 1, 'ycols': [2, 4, 6], 'names': ['m=10 pilot pairs', 'm=40', 'm=160'], 'title': 'Twin pilot: P(wrong decision) vs true correlation rho (r=0.05)', 'alt': 'Line plot of the probability of misclassifying whether to use the twin against the true correlation rho, for 10, 40 and 160 pilot pairs; error peaks near the threshold rho* of 0.426 and falls as the pilot grows', 'xlabel': 'true twin-real correlation rho', 'ylabel': 'P(wrong decision)', 'maxrows': 7}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
