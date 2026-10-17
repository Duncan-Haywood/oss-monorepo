"""Write experiments/jaw_vs_opening.svg: jaw opening a gripper copy needs vs the opening it offers, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'jaw_vs_opening.svg', 'section': '## 1. Required jaw', 'xcol': 0, 'ycols': [1, 2], 'names': ['jaw needed to assemble a copy', 'jaw opening offered'], 'title': 'Robofab bootstrap: a gripper copies itself only above scale 4 (pad 4 mm)', 'alt': 'Line plot against gripper scale of the smallest jaw opening needed to assemble a copy and the opening the gripper offers; the offered opening overtakes the needed one at scale 4.0', 'xlabel': 'gripper scale', 'ylabel': 'jaw opening (mm)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"])
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
