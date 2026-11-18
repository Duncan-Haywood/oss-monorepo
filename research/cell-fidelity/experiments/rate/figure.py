"""Write experiments/rate/rate.svg: set-median ten-cycle forecast error of the law fed the measured OCP rise (O), the
measured plating-overpotential rise (P), and each with the measured charge-capacity factor (OQ, PQ), from the committed
summary.json (never retyped).

    python experiments/rate/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

VARS = ("O", "P", "OQ", "PQ")


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, [1, 2, 3, 4], [d[f"e_{v}"] for v in VARS]) for st, d in S.items()]
    e = {st: d["e_PQ"] for st, d in S.items()}
    write_lines(HERE, "rate.svg", "Ten-cycle forecast error as the law's inputs are replaced by measured ones (set medians)",
                "Line plot of the set-median error |ln(L_pred(99)/L_DFN(99))| of the ten-cycle plating forecast for four "
                "PyBaMM parameter sets, for four variants: 1 the measured OCP rise, 2 the measured plating overpotential "
                "rise, 3 the OCP rise with the measured charge-capacity factor, 4 the overpotential rise with the measured "
                "capacity factor. With both measured the errors are "
                + ", ".join(f"{v:.3f} ({k})" for k, v in e.items()) + ".",
                "variant: 1 = O, 2 = P, 3 = OQ, 4 = PQ", "set median |ln(L_pred/L_DFN)| at cycle 99", series,
                xticks=[1, 2, 3, 4])


if __name__ == "__main__":
    main()
