"""Write experiments/edge.svg from experiments/results.json, no plotting dependency.

    python experiments/figure.py

Grouped bars: the time-optimal carry's edge over the tuned trapezoid for each of the 9 rows, with the trapezoid checked at 160 ramp
samples (robofab-torquebound) and with the dense check. Numbers are read from the committed run output; re-run run.py first if the
experiment changes.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = json.loads((HERE / "results.json").read_text())
W, H, L, R, T, B = 700, 380, 56, 16, 40, 78
hi = 0.25
bw = (W - L - R) / len(rows)
py = lambda v: T + (1 - v / hi) * (H - T - B)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Edge of the time-optimal carry over a tuned trapezoid for nine rows, with a sparse and a dense trapezoid peak check, in a stylised simulation">',
       f'<rect width="{W}" height="{H}" fill="#fff"/>',
       f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Time-optimal edge over the trapezoid (stylised simulation)</text>']
for v in (0, 0.05, 0.10, 0.15, 0.20, 0.25):
    out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/><text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{100*v:.0f}%</text>')
for i, r in enumerate(rows):
    x0 = L + i * bw + bw * 0.15
    for j, (key, col) in enumerate((("edge160", "#1f6fb2"), ("edge_dense", "#e67e22"))):
        h = r[key]
        out.append(f'<rect x="{x0 + j * bw * 0.35:.1f}" y="{py(h):.1f}" width="{bw * 0.33:.1f}" height="{py(0) - py(h):.1f}" fill="{col}"/>')
    k = "none" if r["k"] is None else f'{r["k"]:g}'
    out.append(f'<text x="{L + (i + 0.5) * bw:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{r["L"]:g} m</text>')
    out.append(f'<text x="{L + (i + 0.5) * bw:.1f}" y="{H-B+30}" text-anchor="middle" font-family="sans-serif" font-size="11">k={k}</text>')
for j, (lab, col) in enumerate((("160 ramp samples (robofab-torquebound)", "#1f6fb2"), ("dense check (10000 + 1000 per ramp)", "#e67e22"))):
    out.append(f'<rect x="{L + j * 290}" y="{H-24}" width="12" height="12" fill="{col}"/><text x="{L + j * 290 + 18}" y="{H-14}" font-family="sans-serif" font-size="11">{lab}</text>')
out.append("</svg>")
(HERE / "edge.svg").write_text("\n".join(out) + "\n")
print("wrote", HERE / "edge.svg")
