"""Write experiments/extinction_time.svg: exact mean time to extinction against the quasi-stationary estimate, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'extinction_time.svg', 'section': '== A.', 'xcol': 0, 'ycols': [3, 4], 'names': ['QSD estimate 1/lam0', 'exact T1'], 'title': 'Fleet extinction: quasi-stationary estimate vs exact mean time', 'alt': 'Log-scale line plot of the mean hours to fleet extinction against the load L at B=4; the quasi-stationary estimate overshoots the exact mean time by 1.2 to 1.6 times', 'xlabel': 'L', 'ylabel': 'hours', 'logy': True, 'maxrows': 5}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
