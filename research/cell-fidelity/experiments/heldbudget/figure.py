"""Write experiments/heldbudget/heldbudget.svg: for the 64 held-out designs, the set-median Shapley value of measuring
each input of the ten-cycle forecast (1 OCP rise M, 2 drift D, 3 capacity factor q) and 4 the error left when every
input is measured (e_111, the law's own term), from the committed summary.json (never retyped).

    python experiments/heldbudget/figure.py
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
    series = [(st, [1, 2, 3, 4], [d["phi"][g] for g in FACTORS] + [d["e"]["111"]]) for st, d in S.items()]
    fl = {st: d["e"]["111"] for st, d in S.items()}
    write_lines(HERE, "heldbudget.svg", "Held-out error budget of the ten-cycle lithium-plating forecast (64 designs)",
                "Line plot, for four PyBaMM parameter sets on 64 designs never used to build the forecast, of the "
                "set-median Shapley value of measuring each input (1 the node lever's OCP rise, 2 the non-OCP drift, "
                "3 the capacity factor) and 4 the error left when every input is measured, in |ln(L_pred/L_DFN)| at "
                "cycle 99. The error left is " + ", ".join(f"{v:.3f} ({k})" for k, v in fl.items()) + ".",
                "1 OCP rise M, 2 drift D, 3 capacity factor q (Shapley); 4 error with all measured",
                "set median (drop in error, or error)", series, xticks=[1, 2, 3, 4])


if __name__ == "__main__":
    main()
