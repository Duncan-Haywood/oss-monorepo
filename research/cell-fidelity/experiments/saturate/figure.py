"""Write experiments/saturate/saturate.svg: set-median error at cycle 99 of three ten-cycle forecasts of the
charge-capacity factor against the measured one (5zr's window with an eta line q_E, the window with a saturating
eta q_S, the window with eta held after cycle 10 q_H), from the committed summary.json (never retyped).

    python experiments/saturate/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

KEYS = ("qerrE", "qerrS", "qerrH")


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, [1, 2, 3], [d[k] for k in KEYS]) for st, d in S.items()]
    e = {st: d["qerrS"] for st, d in S.items()}
    write_lines(HERE, "saturate.svg", "Ten-cycle forecasts of the charge-capacity factor at cycle 99 (set medians)",
                "Line plot of the set-median |ln(q_forecast/q_measured)| of the charge-capacity factor at cycle 99 for "
                "four PyBaMM parameter sets: 1 the electrode-balance window with a ten-cycle line in the charge "
                "overpotential, 2 the window with a saturating ten-cycle fit, 3 the window with the line held after "
                "cycle 10. The saturating forecast's errors are "
                + ", ".join(f"{v:.3f} ({k})" for k, v in e.items()) + ".",
                "forecast: 1 = eta line, 2 = saturating eta, 3 = eta held after cycle 10",
                "set median |ln(q/q_M)| at cycle 99", series, xticks=[1, 2, 3])


if __name__ == "__main__":
    main()
