"""Write experiments/nodetransfer/nodetransfer.svg: set-median late gain h (fitted over cycles 3..99) on the node
lever's shift, by anode node from the current collector (1) to the separator (20), from the committed summary.json
(never retyped).

    python experiments/nodetransfer/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = [(st, list(range(1, len(d["h_node"]) + 1)), d["h_node"]) for st, d in S.items()]
    write_lines(HERE, "nodetransfer.svg", "Late (cycles 3 to 99) gain on the node lever's shift, by anode node",
                "Line plot of the set-median gain fitted over cycles 3 to 99 on the law's uniform stoichiometry shift, "
                "by anode node from the current collector (1) to the separator (20), for four PyBaMM parameter sets; "
                "the leave-one-design-out lever T carries the other designs' median profile. Set-median cycle-99 "
                "forecast error, T against the uniform lever: "
                + ", ".join(f"{k} {100 * d['e']['NT']:.1f}% vs {100 * d['e']['NS']:.1f}%" for k, d in S.items()) + ".",
                "anode node (1 collector, 20 separator)", "set median late gain on the shift", series,
                xticks=[1, 5, 10, 15, 20])


if __name__ == "__main__":
    main()
