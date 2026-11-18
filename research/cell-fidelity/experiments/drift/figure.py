"""Write experiments/drift/drift.svg: set-median ten-cycle forecast error of the law with 5zd's lever (A), 5zn's node
lever (N), the ten-cycle forecasts of both oracle inputs (F) and 5zp's oracle diagnosis (PQ), from the committed
summary.json (never retyped).

    python experiments/drift/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

VARS = ("A", "N", "F", "PQ")


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, [1, 2, 3, 4], [d[f"e_{v}"] for v in VARS]) for st, d in S.items()]
    e = {st: d["e_F"] for st, d in S.items()}
    write_lines(HERE, "drift.svg", "Ten-cycle forecasts of the two oracle inputs against the levers (set medians)",
                "Line plot of the set-median error |ln(L_pred(99)/L_DFN(99))| of the ten-cycle plating forecast for four "
                "PyBaMM parameter sets: 1 the law's own lever, 2 the node lever, 3 the node lever plus a ten-cycle "
                "forecast of the non-OCP overpotential drift with a ten-cycle capacity factor, 4 both inputs measured "
                "to cycle 99. The ten-cycle forecast's errors are "
                + ", ".join(f"{v:.3f} ({k})" for k, v in e.items()) + ".",
                "variant: 1 = A, 2 = N, 3 = F, 4 = PQ (reads cycle 99)", "set median |ln(L_pred/L_DFN)| at cycle 99",
                series, xticks=[1, 2, 3, 4])


if __name__ == "__main__":
    main()
