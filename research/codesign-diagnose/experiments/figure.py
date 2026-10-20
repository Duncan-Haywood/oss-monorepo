"""Write experiments/best_so_far.svg: median best test success against designs evaluated, from results.json.

    python experiments/figure.py
"""
import json, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    res = json.loads((HERE / "results.json").read_text())
    xs = list(range(1, res["budget"] + 1))
    series = [(m, xs, [float(np.median([r["curve"][n - 1] for r in runs])) for n in xs]) for m, runs in res["methods"].items()]
    write_lines(HERE, "best_so_far.svg", "Gripper co-design: median best test success vs designs evaluated (8 seeds)",
                "Line plot of the median best held-out grasp success against the number of designs evaluated for three baselines and three scripted readers with different feedback; all end between 0.84 and 0.86",
                "designs evaluated", "best test success", series)


if __name__ == "__main__":
    main()
