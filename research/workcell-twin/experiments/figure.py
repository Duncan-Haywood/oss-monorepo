"""Write experiments/claim_vs_real.svg: twin claim against simulated real mean, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'claim_vs_real.svg', 'section': 'Model A (task', 'xcol': 0, 'ycols': [2, 3], 'names': ['twin claims', 'real mean'], 'title': 'Workcell twin: promised vs delivered makespan (k=8)', 'alt': "Line plot of the twin's promised makespan (16 min) and the simulated mean makespan against task variability kappa; the gap widens as tasks get more variable", 'xlabel': 'gamma shape kappa (higher = less variable)', 'ylabel': 'makespan (min)', 'logx': True, 'logy': False, 'maxrows': 4}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
