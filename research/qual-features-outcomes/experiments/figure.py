"""Write experiments/reply_auc.svg: test AUC against labelled outcomes for each feature set, outcome A of results.txt.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt; re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "== A.", 0, [1, 3, 4, 6])
    write_lines(HERE, "reply_auc.svg", "Predicting reply vs top-level comment: test AUC by feature set",
                "Line plot: test AUC of a logistic regression against the number of labelled outcomes from 50 to 1600, for numeric "
                "features, human emotion codes plus numeric features, tf-idf words plus numeric features, and LSA plus numeric features; "
                "all stay between 0.51 and 0.60",
                "labelled outcomes (n)", "test AUC (0.5 = chance)",
                [("numeric only", xs, ys[0]), ("emotion codes + numeric", xs, ys[1]), ("bag of words + numeric", xs, ys[2]),
                 ("LSA (100-d) + numeric", xs, ys[3])], logx=True, hline=0.5)


main()
