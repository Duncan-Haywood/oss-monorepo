"""Write experiments/accuracy_by_split.svg from the committed results.json (never retyped).

    python3 experiments/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    res = json.loads((HERE / "results.json").read_text())
    splits = list(res["splits"])
    xs = list(range(1, len(splits) + 1))
    models = list(res["splits"][splits[0]])
    series = [(m, xs, [100 * res["splits"][s][m]["mean_accuracy"] for s in splits]) for m in models]
    write_lines(HERE, "accuracy_by_split.svg",
                "CWRU bearing faults: test accuracy by split",
                "Line plot of test accuracy for four classifiers across four splits: S1 random windows and "
                "S2 time split near 100% for the spectrum models, S3 leave-one-load-out still above 94% "
                "for three of four, S4 leave-one-fault-size-out between 44% and 71%",
                "split (1 random windows, 2 time, 3 held-out load, 4 held-out fault size)",
                "accuracy (%)", series)


if __name__ == "__main__":
    main()
