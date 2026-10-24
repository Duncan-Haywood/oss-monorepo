"""Write experiments/arms.svg: cell output against grasp clearance for one, two and three arms, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3])
    write_lines(HERE, "arms.svg",
                "What does arm-to-arm blocking on one pile cost?",
                "Line plot of garments hung or folded per hour against the clearance two grippers need between grasps in metres, one line each for one, two and three arms: the one-arm line is flat near 147, the two-arm line falls from about 201 to 190 and the three-arm line from about 205 to 194",
                "clearance needed between two grasps (m, assumed)", "garments hung or folded per hour (see policy)",
                [("%d arm%s" % (a, "s" if a > 1 else ""), xs, ys[i]) for i, a in enumerate((1, 2, 3))])


if __name__ == "__main__":
    main()
