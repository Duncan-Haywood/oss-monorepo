"""Write experiments/oracle/oracle.svg: set-median ten-cycle forecast error for 5zd's lever (A), 5zn's node lever (N)
and the oracle lever (O), and O with its line through 30 and 50 cycles, from the committed summary.json (never retyped).

    python experiments/oracle/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    ks = (10, 30, 50)
    series = [(st, list(ks), [d["eO"], d["eO30"], d["eO50"]]) for st, d in S.items()]
    write_lines(HERE, "oracle.svg", "Forecast error with the measured plating lever, line through cycles 2..k (set medians)",
                "Line plot of the set-median error |ln(L_pred(99)/L_DFN(99))| of the forecast law fed the measured "
                "plating-weighted OCP rise, against the number of cycles its line is fitted through, for four PyBaMM "
                "parameter sets. At ten cycles the errors are 0.042 (Ai2020), 0.038 (Chen2020), 0.034 (OKane2022) and "
                "0.012 (NCA_Kim2011); at fifty they are 0.010 to 0.016.", "cycles in the line fit k",
                "set median |ln(L_pred/L_DFN)| at cycle 99", series)


if __name__ == "__main__":
    main()
