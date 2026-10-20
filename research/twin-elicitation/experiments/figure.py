"""Write experiments/certainty_equivalent_loss.svg: excess expected cost of deploying the mean report against the posterior sd tau, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'certainty_equivalent_loss.svg', 'section': '== 2.', 'xcol': 0, 'ycols': [1, 3], 'names': ['measured', 'quadratic form'], 'title': 'Twin elicitation: certainty-equivalent loss', 'alt': 'Log-log line plot of the excess expected cost against the posterior standard deviation tau; the measured loss follows the quadratic-form approximation at small tau and grows roughly with the fourth power', 'xlabel': 'posterior sd tau', 'ylabel': 'excess expected cost', 'logx': True, 'logy': True}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
