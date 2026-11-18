"""Write experiments/horizon10/horizon.svg: the set-median plating exponent read from the plating-weighted lever
with a budget of k cycles, against k, from the committed summary.json (never retyped).

    python experiments/horizon10/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    S = json.loads((HERE / "summary.json").read_text())["sets"]
    series = []
    for st, by in S.items():
        ks = sorted(int(k) for k in by)
        xs = ks + [99]
        ys = [by[str(k)]["k_w"] for k in ks] + [by[str(ks[0])]["k_w99"]]
        series.append((st, xs, ys))
    write_lines(HERE, "horizon.svg", "Plating exponent read from the first k DFN cycles (set medians)",
                "Line plot of the set-median plating exponent kappa_w,k against the cycle budget k for four PyBaMM "
                "parameter sets. NCA_Kim2011 is flat near 27 from 10 cycles; Ai2020 falls from 43 to 22-25 by 30 "
                "cycles; Chen2020 and OKane2022 stay far above their cycle-99 values (34 to 38) until after 50 cycles.",
                "cycle budget k", "kappa_w,k (1/V); 25.3 = alpha F/RT", series, hline=25.3)


if __name__ == "__main__":
    main()
