"""Write experiments/nees.svg: NEES per degree of freedom against outage length at B = 100 ug, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'nees.svg', 'section': 'Z. NEES', 'xcol': 0, 'ycols': [1, 2, 3, 4],
       'names': ['matched 1/f model', 'random walk tuned at 100 s', 'tuned at 10 s', 'tuned at 1 s'],
       'title': 'Does the filter know how wrong it is? NEES/dof after a GNSS outage (1 = honest)',
       'alt': 'Line plot of NEES per degree of freedom against GNSS outage length for four filters; the matched model stays at 1, the random walk tuned at 100 s sits near 1.5, and tuning at 10 s or 1 s falls well below 1',
       'xlabel': 'GNSS outage (s)', 'ylabel': 'NEES / dof'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
