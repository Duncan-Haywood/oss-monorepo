"""Write experiments/gap_vs_load.svg: IEEE 118-bus, DC OPF cost error and cost of the DC dispatch under AC, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "case118, limits", 0, [1, 2])
    series = list(zip(["DC OPF cost minus AC optimum (%)", "AC cost of DC dispatch minus AC optimum (%)"], [xs] * len(ys), ys))
    write_lines(HERE, "gap_vs_load.svg", "IEEE 118-bus: what the DC model gets wrong",
                "Line plot against load level: the DC OPF reports a cost 2 to 3 percent below the AC optimum, and its dispatch costs 0.7 to 1.9 percent more than the AC optimum once losses are paid",
                "load (multiple of the case)", "% of AC optimal cost", series)


if __name__ == "__main__":
    main()
