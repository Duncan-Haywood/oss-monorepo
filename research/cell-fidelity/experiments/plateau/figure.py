"""Write experiments/plateau/plateau.svg: the set-median ratio of the measured plating-weighted OCP rise to the node
lever's rise, fitted over cycles 3..k, against k, from the committed summary.json (never retyped).

    python experiments/plateau/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    ks = (10, 20, 30, 50, 99)
    series = [(st, list(ks), [d[f"rho{k}"] for k in ks]) for st, d in S.items()]
    write_lines(HERE, "plateau.svg", "Measured plating-weighted rise / node-lever rise, cycles 3..k (set medians)",
                "Line plot of the set-median slope of the measured plating-weighted OCP rise on the plateau-aware node "
                "lever, fitted over cycles 3 to k, for four PyBaMM parameter sets. Ai2020 and Chen2020 reach 1.00 and "
                "0.98 by cycle 99, OKane2022 0.84, NCA_Kim2011 1.18; at ten cycles the ratios are 0.67, 0.81, 0.57 "
                "and 0.99.", "cycle budget k", "slope (1 = the lever reproduces the rise)", series, hline=1.0)


if __name__ == "__main__":
    main()
