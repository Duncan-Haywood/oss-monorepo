"""Write drift7c.svg: the all-measured forecast error's quantiles over designs, for the ten-cycle line (L) and the
correction from the cycle-2 plating depth (C), on the two LG M50 sets, from rows.json (re-run run.py rows first if
the experiment changes).

    python experiments/drift7c/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

RS = json.loads((HERE / "rows.json").read_text())
QS = (0.5, 0.6, 0.7, 0.75, 0.8, 0.9)


def quant(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def main():
    series = []
    for st in ("Chen2020", "OKane2022"):
        c = [r["cells"]["111"] for r in RS if r["set"] == st]
        for k, lab in (("eL", "ten-cycle line"), ("e_C", "plating-depth correction")):
            series.append((f"{st} {lab}", [100 * p for p in QS], [100 * quant([x[k] for x in c], p) for p in QS]))
    write_lines(HERE, "drift7c.svg", "cell-fidelity 7c: the cycle-2 plating depth flags the LG M50 designs whose rate drifts",
                "Cycle-99 lithium-loss error with every input measured, by quantile over 28 designs per set. The "
                "correction leaves the median near 2% but cuts the upper quartile from 7.3-8.0% to 3.0-3.5%.",
                "quantile over designs (%)", "error at cycle 99 (%)", series)


if __name__ == "__main__":
    main()
