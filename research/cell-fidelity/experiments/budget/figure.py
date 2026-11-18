"""Write experiments/budget/budget.svg: set-median Shapley value of measuring each input of the ten-cycle forecast
(1 the node lever's OCP rise M, 2 the non-OCP drift D, 3 the capacity factor q), from the committed summary.json
(never retyped).

    python experiments/budget/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

FACTORS = ("M", "D", "q")


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, [1, 2, 3], [d["phi"][g] for g in FACTORS]) for st, d in S.items()]
    m = {st: d["phi"]["M"] for st, d in S.items()}
    write_lines(HERE, "budget.svg", "Error budget of the ten-cycle lithium-plating forecast (Shapley, set medians)",
                "Line plot of the set-median Shapley value, in |ln(L_pred/L_DFN)| at cycle 99, of measuring each input "
                "of the ten-cycle forecast for four PyBaMM parameter sets: 1 the node lever's OCP rise, 2 the non-OCP "
                "plating-overpotential drift, 3 the charge-capacity factor. The OCP rise's values are "
                + ", ".join(f"{v:.3f} ({k})" for k, v in m.items()) + ".",
                "input measured: 1 OCP rise M, 2 drift D, 3 capacity factor q",
                "set median Shapley value (drop in error)", series, xticks=[1, 2, 3])


if __name__ == "__main__":
    main()
