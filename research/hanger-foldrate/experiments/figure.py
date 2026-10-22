"""Write experiments/policy_vs_fold.svg: cell output by policy against fold time, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3])
    write_lines(HERE, "policy_vs_fold.svg",
                "What does a slow fold do to a laundry-hanging cell?",
                "Line plot of garments per hour against fold time in seconds for always fold, the learned rule and always hang: folding falls from 141 to 3 per hour as the fold time rises from 25 s to 1200 s while always hanging stays near 145",
                "fold time per garment (s; 90-120 s is SpeedFolding)", "garments per hour (one arm)",
                [("always fold", xs, ys[0]), ("learned rule", xs, ys[1]), ("always hang", xs, ys[2])])


if __name__ == "__main__":
    main()
