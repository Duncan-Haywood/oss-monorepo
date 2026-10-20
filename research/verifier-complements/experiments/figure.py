"""Write experiments/value_of_verifiers.svg: decision value of n identical verifiers, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'value_of_verifiers.svg', 'section': 'E1.', 'xcol': 1, 'ycols': [3], 'names': ['decision value V(n)'], 'title': 'Verifier complements: value of n identical verifiers', 'alt': 'Line plot of the decision value of n identical verifiers; it is zero until the fourth verifier, then rises', 'xlabel': 'verifiers n', 'ylabel': 'decision value V(n)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
