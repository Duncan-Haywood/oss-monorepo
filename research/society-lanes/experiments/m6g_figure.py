"""Figure for milestone 6g: transit across the 8 m section against the density each walker saw.

The real curve (HERMES free choice) and each twin's fitted quadratic, read from the coefficients printed in
m6g_density_cost_results.txt (never retyped), each over its own 5th to 95th percentile of density. Stdlib only.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import svg_lines  # noqa: E402

text = (HERE / "m6g_density_cost_results.txt").read_text().splitlines()
pat = re.compile(r"^\s+(.+?): (?:\d+ crossings in \d+ runs; )?density 5th/(?:50th/)?95th(?: pct)? ([\d.]+)/(?:[\d.]+/)?([\d.]+)(?: /m\^2)?; coef ([-+\d.]+), ([-+\d.]+), ([-+\d.]+)")
series = []
for line in text:
    m = pat.match(line)
    if not m:
        continue
    name, lo, hi = m.group(1), float(m.group(2)), float(m.group(3))
    if name == "symmetric":
        continue
    a, b, c = (float(m.group(i)) for i in (4, 5, 6))
    xs = [round(lo + i * (hi - lo) / 20, 3) for i in range(21)]
    label = "real (HERMES)" if name == "free" else name.replace("social force", "SF").replace(
        "collision-free speed", "CFSM")
    series.append((label, xs, [a + b * x + c * x * x for x in xs]))
assert len(series) == 5, series
svg = svg_lines("Milestone 6g: time to cross 8 m against the density each walker saw",
                "Fitted transit-density curves: real HERMES free-choice runs against four crowd twins",
                "density seen while crossing (persons per m^2)", "transit across 8 m (s)", series,
                xticks=[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0])
# the real curve drawn thicker; linefig gives the fifth series its own colour and fits the legend
svg = svg.replace('stroke="#c0392b" stroke-width="2"/>', 'stroke="#c0392b" stroke-width="3"/>', 1)
(HERE / "m6g_density_cost.svg").write_text(svg)
print("wrote", HERE / "m6g_density_cost.svg")
