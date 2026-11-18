"""Write experiments/window/window.svg: set-median error at cycle 99 of three forecasts of the charge-capacity factor
against the measured one (5zq's straight line q_10, this milestone's window q_E, the balance alone q_B), from the
committed summary.json (never retyped).

    python experiments/window/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

KEYS = ("qerr10", "qerrE", "qerrB")


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, [1, 2, 3], [d[k] for k in KEYS]) for st, d in S.items()]
    e = {st: d["qerrE"] for st, d in S.items()}
    write_lines(HERE, "window.svg", "Ten-cycle forecasts of the charge-capacity factor at cycle 99 (set medians)",
                "Line plot of the set-median |ln(q_forecast/q_measured)| of the charge-capacity factor at cycle 99 for "
                "four PyBaMM parameter sets: 1 a straight line through cycles 2..10, 2 the electrode-balance window "
                "with a ten-cycle line in the charge overpotential, 3 the window with the overpotential held. The "
                "window forecast's errors are " + ", ".join(f"{v:.3f} ({k})" for k, v in e.items()) + ".",
                "forecast: 1 = straight line, 2 = window + eta line, 3 = window, eta held",
                "set median |ln(q/q_M)| at cycle 99", series, xticks=[1, 2, 3])


if __name__ == "__main__":
    main()
