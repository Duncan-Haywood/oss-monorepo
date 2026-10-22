"""Write experiments/go_vs_k.svg: the learned go probabilities against the collision cost, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'go_vs_k.svg', 'section': '== E. collision', 'xcol': 0, 'ycols': [1, 2],
       'names': ['go against cue senders (gS)', 'go against others (gQ)'],
       'title': 'Self-interested door robots: learned go probability against the collision cost',
       'alt': 'Line plot of the learned go probability of door robots against the collision cost k from 1.5 to 6; against partners who send the urgency cue it stays near 0, against others it falls from 0.68 to 0.03',
       'xlabel': 'collision cost k', 'ylabel': 'learned go probability', 'logx': False, 'logy': False, 'maxrows': 8}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
