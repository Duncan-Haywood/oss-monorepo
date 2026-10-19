"""Write experiments/budget_curve.svg: closure gained against capability-development budget, parsed from results.txt.

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
    xs, ys = table(TEXT, "== closure (points) vs budget", 0, [1, 2])
    series = list(zip(["mass closure gained", "cost closure gained"], [xs] * 2, ys))
    alt = (f"Line plot of closure points gained against capability budget, best capability set at each budget: "
           f"at budget {xs[-1]:.0f} mass {ys[0][-1]:.0f} and cost {ys[1][-1]:.0f} points, with steps where a shared capability unlocks several parts")
    write_lines(HERE, "budget_curve.svg", "Selfrep-capability: closure gained by capability budget", alt,
                "capability development effort (assumed units)", "closure points gained", series)


if __name__ == "__main__":
    main()
