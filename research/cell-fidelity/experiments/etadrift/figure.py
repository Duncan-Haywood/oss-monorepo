"""Write experiments/etadrift/etadrift.svg: set-median cycle-99 lithium-loss error of the node lever with q_S and
four drift terms (none NS, 5zq's line FL, the line held after cycle 10 FH, the eta-tied drift FS, the measured drift
ND), from the committed summary.json (never retyped).

    python experiments/etadrift/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

KEYS = ("e_NS", "e_FL", "e_FH", "e_FS", "e_ND")


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, [1, 2, 3, 4, 5], [d[k] for k in KEYS]) for st, d in S.items()]
    e = {st: d["e_FS"] for st, d in S.items()}
    write_lines(HERE, "etadrift.svg", "Ten-cycle lithium-plating forecasts with a drift term at cycle 99 (set medians)",
                "Line plot of the set-median |ln(L_pred/L_DFN)| at cycle 99 for four PyBaMM parameter sets, node lever "
                "with the saturating window factor and: 1 no drift term, 2 a ten-cycle drift line, 3 that line held "
                "after cycle 10, 4 a drift tied to the falling charge overpotential, 5 the measured drift. The "
                "eta-tied forecast's errors are " + ", ".join(f"{v:.3f} ({k})" for k, v in e.items()) + ".",
                "drift term: 1 none, 2 line, 3 line held, 4 eta-tied, 5 measured",
                "set median |ln(L_pred/L_DFN)| at cycle 99", series, xticks=[1, 2, 3, 4, 5])


if __name__ == "__main__":
    main()
