"""Write experiments/auc_vs_labels.svg: held-out AUC of four feature sets against labelled items, from results.txt.

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "n_labelled", 0, [1, 3, 5, 7])
    names = ["bag of words", "random-projection vector", "12 codebook codes", "words + codes"]
    write_lines(HERE, "auc_vs_labels.svg", "Predicting negative emotion: AUC against labelled items",
                "Line plot of held-out AUC against the number of labelled training comments, 25 to 1600, for four feature sets; "
                "the 12 codebook codes lead at every size",
                "labelled items", "held-out AUC", [(n, xs, y) for n, y in zip(names, ys)], logx=True)


if __name__ == "__main__":
    main()
