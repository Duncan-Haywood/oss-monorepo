"""Write experiments/nodegain/nodegain.svg: set-median fitted gain on the node lever's shift, by anode node from the
current collector (1) to the separator (20), from the committed summary.json (never retyped).

    python experiments/nodegain/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, list(range(1, len(d["gain_node"]) + 1)), d["gain_node"]) for st, d in S.items()]
    write_lines(HERE, "nodegain.svg", "Ten-cycle gain on the node lever's stoichiometry shift, by anode node",
                "Line plot of the set-median gain fitted over cycles 3 to 10 on the law's uniform stoichiometry shift, "
                "by anode node from the current collector (1) to the separator (20), for four PyBaMM parameter sets; "
                "a gain of 1 is 5zn's node lever. Plating-weighted mean gains: "
                + ", ".join(f"{d['gain_w']:.2f} ({k})" for k, d in S.items()) + ".",
                "anode node (1 collector, 20 separator)", "set median gain on the shift", series,
                xticks=[1, 5, 10, 15, 20])


if __name__ == "__main__":
    main()
