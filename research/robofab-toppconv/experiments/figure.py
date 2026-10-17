"""Write experiments/convergence.svg: total carry time of the time-optimal solver against node count, from results.json.

    python experiments/figure.py

Numbers are read from the committed results.json, never retyped: re-run run.py first if the experiment changes.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

ROWS = json.loads((HERE / "results.json").read_text())


def series(wmax, k):
    out = []
    for r in ROWS:
        if r["wmax"] == wmax and r["k"] == k:
            ns = sorted(int(n) for n in r["T_opt"])
            ref = r["T_opt"][str(ns[-1])]
            xs = ns[:-1]
            ys = [abs(r["T_opt"][str(n)] - ref) / ref * 100 for n in xs]
            out.append((f"L={r['L']} m", xs, ys))
    return out


def main():
    write_lines(HERE, "convergence.svg",
                "Time-optimal carry: error against the finest grid (wmax 2 rad/s, jaw cap 5x)",
                "Log-log plot of the percent difference of the six-part carry time at 400, 1600 and 6400 nodes from the 25600-node value, for three arm reaches; the error falls by roughly two to three orders of magnitude",
                "nodes n", "|T(n) - T(25600)| / T(25600) (%)", series(2.0, 5.0), logx=True, logy=True)


if __name__ == "__main__":
    main()
