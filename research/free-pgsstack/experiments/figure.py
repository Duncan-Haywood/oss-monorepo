"""Write experiments/iters_needed.svg: iterations needed to hold a stack still, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "1. iterations", 0, [1, 2, 3, 4])
    names = ["bottom-up, warm start", "top-down, warm start", "bottom-up, cold", "top-down, cold"]
    write_lines(HERE, "iters_needed.svg", "Projected Gauss-Seidel: iterations per step needed to hold an n-box stack still",
                "Log-log plot of iterations per step against boxes in the stack; points with more than 2048 needed are omitted",
                "boxes in stack n", "iterations per step", list(zip(names, [xs] * 4, ys)), logx=True, logy=True)


if __name__ == "__main__":
    main()
