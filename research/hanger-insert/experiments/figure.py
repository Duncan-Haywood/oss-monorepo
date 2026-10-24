"""Write experiments/peak_vs_radius.svg: the loop each hanger needs against its end radius, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'peak_vs_radius.svg', 'section': '== B. Smallest loop', 'xcol': 0, 'ycols': [1, 2, 3],
       'names': ['rigid', 'telescoping (10 cm)', 'folding (60 deg)'],
       'title': 'Hanger insertion: smallest neck loop (cm) against end radius',
       'alt': 'Line plot of the smallest loop perimeter a hanger can pass through, against its end radius: a rigid 22.8 cm arm needs about 47 to 58 cm, a telescoping hanger collapsed to 10 cm needs 22 to 33 cm, and a hanger whose arms fold down 60 degrees needs 22 to 40 cm',
       'xlabel': 'end radius r (cm)', 'ylabel': 'peak loop perimeter (cm)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], list(zip(c["names"], [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
