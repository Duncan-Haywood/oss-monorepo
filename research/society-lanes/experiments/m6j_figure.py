"""Figure for milestone 6j: time to cross the 8 m section against the density seen while crossing, on
fresh seeds (Part B), for 6i's collision-free speed pair and 6j's chosen pair, with the real HERMES
free-choice curve (quadratic least squares on 6g's committed per-walker crossings, as m6g_density_cost).

Reads m6j_twofit_runs.csv, m6j_twofit_results.txt and m6g_density_cost_real.csv; stdlib only.
"""
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import svg_lines  # noqa: E402


def quad_fit(xs, ys):
    """Least-squares a + b x + c x^2 by the normal equations (3 x 3, Gaussian elimination)."""
    s = [sum(x ** k for x in xs) for k in range(5)]
    t = [sum(y * x ** k for x, y in zip(xs, ys)) for k in range(3)]
    a = [[s[i + j] for j in range(3)] + [t[i]] for i in range(3)]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(a[r][i]))
        a[i], a[p] = a[p], a[i]
        for r in range(3):
            if r != i:
                f = a[r][i] / a[i][i]
                a[r] = [u - f * v for u, v in zip(a[r], a[i])]
    return [a[i][3] / a[i][i] for i in range(3)]


res = (HERE / "m6j_twofit_results.txt").read_text()
chosen = re.search(r"chosen pair: \(([\d.]+), ([\d.]+)\)", res)
pairs = [("0.3", "0.2", "6i: T 0.3 s, r 0.2 m")]
if chosen and (chosen.group(1), chosen.group(2)) != ("0.3", "0.2"):
    pairs.append((chosen.group(1), chosen.group(2), f"6j: T {chosen.group(1)} s, r {chosen.group(2)} m"))
ns = (20, 40, 60, 75, 90, 105, 120, 140, 160)
cells = {}
with open(HERE / "m6j_twofit_runs.csv") as f:
    for r in csv.DictReader(f):
        if r["part"] != "B" or int(r["failed"]) or r["transit_s"] == "nan" or int(r["walkers"]) not in ns:
            continue
        k = (r["time_gap_s"], r["radius_m"], r["entrance_m"], int(r["walkers"]))
        cells.setdefault(k, []).append((float(r["transit_density"]), float(r["transit_s"])))
series = []
for t, rad, label in pairs:
    pts = sorted((sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v))
                 for k, v in cells.items() if k[0] == t and k[1] == rad)
    series.append((label, [p[0] for p in pts], [p[1] for p in pts]))
xs, ys = [], []
with open(HERE / "m6g_density_cost_real.csv") as f:
    for r in csv.DictReader(f):
        if r["set"] == "free":
            xs.append(float(r["density_m2"]))
            ys.append(float(r["transit_s"]))
c = quad_fit(xs, ys)
lo, hi = sorted(xs)[int(0.05 * len(xs))], sorted(xs)[int(0.95 * len(xs))]
g = [round(lo + i * (hi - lo) / 20, 3) for i in range(21)]
series.append(("HERMES free-choice curve (real)", g, [c[0] + c[1] * x + c[2] * x * x for x in g]))
svg = svg_lines("Milestone 6j: collision-free speed fitted on time gap and radius",
                "Time to cross 8 m against the density seen while crossing, fresh seeds, both entrances pooled"
                " by cell: 6i's pair, 6j's chosen pair and the real HERMES free-choice curve",
                "density seen while crossing (persons per m^2)", "time to cross 8 m (s)", series,
                xticks=[0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0])
(HERE / "m6j_twofit.svg").write_text(svg)
print("wrote", HERE / "m6j_twofit.svg")
