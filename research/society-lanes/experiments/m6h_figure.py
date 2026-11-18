"""Figure for milestone 6h: transit across 8 m against density, recalibrated twins against HERMES.

The real free-choice curve is read from m6g_density_cost_results.txt (its printed coefficients, never
retyped). Each recalibrated twin's curve is the same quadratic, fitted here by least squares to its Part B
grid runs in m6h_recalibrate_runs.csv (fresh seeds), drawn over its own 5th to 95th percentile of density.
Stdlib only.
"""
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
sys.path.insert(0, str(HERE))
from linefig import svg_lines  # noqa: E402

NS = {20, 30, 40, 50, 60, 75, 90, 105, 120}   # m6h_recalibrate.NS (grid cells only, not operating counts)
NAMES = {"sf": "SF", "cfsm": "CFSM", "orca": "ORCA"}


def solve3(A, b):
    """Gaussian elimination for a 3 x 3 system."""
    M = [row[:] + [v] for row, v in zip(A, b)]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        for r in range(3):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [x - f * y for x, y in zip(M[r], M[i])]
    return [M[i][3] / M[i][i] for i in range(3)]


def fit_quad(xs, ys):
    S = [[sum(x ** (i + j) for x in xs) for j in range(3)] for i in range(3)]
    return solve3(S, [sum(y * x ** i for x, y in zip(xs, ys)) for i in range(3)])


def pct(v, q):
    v = sorted(v)
    k = (len(v) - 1) * q / 100.0
    lo = int(k)
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def curve(label, c, lo, hi):
    xs = [round(lo + i * (hi - lo) / 20, 3) for i in range(21)]
    return label, xs, [c[0] + c[1] * x + c[2] * x * x for x in xs]


g = (HERE / "m6g_density_cost_results.txt").read_text()
m = re.search(r"free: \d+ crossings in \d+ runs; density 5th/50th/95th pct ([\d.]+)/[\d.]+/([\d.]+) /m\^2; coef "
              r"([-+\d.]+), ([-+\d.]+), ([-+\d.]+)", g)
series = [curve("real (HERMES)", [float(m.group(i)) for i in (3, 4, 5)], float(m.group(1)), float(m.group(2)))]
pts = {}
with open(HERE / "m6h_recalibrate_runs.csv") as f:
    for r in csv.DictReader(f):
        if r["part"] != "B" or int(r["failed"]) or int(r["walkers"]) not in NS or r["transit_s"] == "nan":
            continue
        pts.setdefault((r["family"], r["multiplier"], r["value"]), []).append(
            (float(r["transit_density"]), float(r["transit_s"])))
for (fam, mult, val), p in sorted(pts.items()):
    xs, ys = [a for a, _ in p], [b for _, b in p]
    series.append(curve(f"{NAMES[fam]} x{float(mult):g}, {'A' if fam == 'sf' else 'T' if fam == 'cfsm' else 'tau'}"
                        f"={float(val):g}", fit_quad(xs, ys), pct(xs, 5), pct(xs, 95)))
assert len(series) == 5, [s[0] for s in series]
svg = svg_lines("Milestone 6h: recalibrated crowd twins against the real transit-density curve",
                "Fitted transit-density curves on fresh seeds: HERMES free-choice runs against four recalibrated twins",
                "density seen while crossing (persons per m^2)", "transit across 8 m (s)", series,
                xticks=[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25])
svg = svg.replace('stroke="#c0392b" stroke-width="2"/>', 'stroke="#c0392b" stroke-width="3"/>', 1)
(HERE / "m6h_recalibrate.svg").write_text(svg)
print("wrote", HERE / "m6h_recalibrate.svg")
