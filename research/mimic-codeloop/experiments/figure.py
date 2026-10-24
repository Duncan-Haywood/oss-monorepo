"""Write experiments/figure.svg: the reference detector's AUROC on held-out people by
round, for the code-model imitator in each condition, from results/run_*.json.

    python3 experiments/figure.py
"""
import glob
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    series = []
    for c in ("blind", "feedback"):
        runs = [json.load(open(p)) for p in sorted(glob.glob(str(HERE.parent / "results" / f"run_{c}_*.json")))]
        n = len(runs[0]["rounds"])
        ys = [sum(r["rounds"][i]["reference"] for r in runs) / len(runs) for i in range(n)]
        series.append((f"code model, {c} ({len(runs)} run)", list(range(n)), ys))
    write_lines(HERE, "figure.svg",
                "Code-model cursor imitator: reference detector AUROC on held-out people",
                "Line plot of a boosted-tree reference detector's AUROC on held-out people over six rounds for a "
                "code-model imitator in two feedback conditions; 0.5 means it cannot tell the imitator from people",
                "round", "AUROC", series, hline=0.5)


if __name__ == "__main__":
    main()
