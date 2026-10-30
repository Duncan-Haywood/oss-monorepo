"""Write experiments/ranking_vs_load_factor.svg: LS/OC shaft-energy median against load factor for four
open-centre neutral pressures (LS standby 0), parsed from idle_models_results.txt (never retyped).

    python3 experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LABELS = {"OC idle bleed(2f)": "OC idle bleed (2f)", "OC idle    40 bar": "p_n 40 bar",
          "OC idle    20 bar": "p_n 20 bar", "OC idle     8 bar": "p_n 8 bar"}


def parse(text):
    lf, out = None, {k: ([], []) for k in LABELS}
    for l in text.splitlines():
        m = re.match(r"load factor ([\d.]+)", l)
        if m:
            lf = float(m.group(1))
            continue
        m = re.match(r"\s*(OC idle.*?), LS standby 0 L/min: ([\d.]+)", l)
        if m and lf is not None and m.group(1) in out:
            out[m.group(1)][0].append(lf)
            out[m.group(1)][1].append(float(m.group(2)))
    return out


def main():
    data = parse((HERE / "idle_models_results.txt").read_text())
    series = []
    for k, (xs, ys) in data.items():
        order = sorted(range(len(xs)), key=xs.__getitem__)
        series.append((LABELS[k], [xs[i] for i in order], [ys[i] for i in order]))
    write_lines(HERE, "ranking_vs_load_factor.svg",
                "Load-sensing vs open-centre shaft energy, by load factor",
                "Line plot of the median load-sensing to open-centre shaft-energy ratio against duty-cycle load factor for four open-centre idle models; load-sensing wins (ratio below 1) at every load factor tested except an 8 bar neutral pressure at load factor 0.5, where the ratio is 1.02",
                "load factor (mean / peak useful power)", "LS / OC median shaft energy", series, hline=1.0)


if __name__ == "__main__":
    main()
