"""Cheap tier's own decision margin against the oscillation of the paired tier error, one point per
instance (log-log). Points above the diagonal are certified by the global bound (C1).

    python3 experiments/m5_margin_bound/figure.py    (reads results.txt; stdlib only)
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"2d->3d": "#c0392b", "cap->conv": "#1f6fb2", "mesh": "#2e8b57", "param": "#8e44ad"}
NAME = {"2d->3d": "2D chain -> 3D sheet", "cap->conv": "3000 iterations -> converged",
        "mesh": "mesh change", "param": "guessed EA / default -> KES-sourced"}
pts, on = [], False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("1. per instance"):
        on = True
        continue
    if on and not l.strip():
        break
    if on:
        p = l.split()
        pts.append((p[0], float(p[7]), float(p[12])))   # family, osc, margin_t
W, H, M = 560, 420, 60
lo, hi = -3.0, 0.5
X = lambda v: M + (math.log10(v) - lo) / (hi - lo) * (W - 2 * M)
Y = lambda v: H - M + 10 - (math.log10(v) - lo) / (hi - lo) * (H - 2 * M)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" font-family="sans-serif" font-size="12">',
     '<title>Decision margin of the cheap tier against the spread of the paired tier error, 50 instances</title>',
     f'<rect width="{W}" height="{H}" fill="white"/>',
     f'<line x1="{X(10**lo)}" y1="{Y(10**lo)}" x2="{X(10**hi)}" y2="{Y(10**hi)}" stroke="#888" stroke-dasharray="4 3"/>',
     f'<text x="{X(0.02)}" y="{Y(0.9)}" fill="#555">certified above the line (margin &gt; osc)</text>']
for k in range(int(lo), 1):
    v = 10.0 ** k
    s.append(f'<text x="{X(v)}" y="{H - M + 28}" text-anchor="middle">{v:g}</text>')
    s.append(f'<text x="{M - 8}" y="{Y(v) + 4}" text-anchor="end">{v:g}</text>')
s.append(f'<line x1="{M}" y1="{H - M + 10}" x2="{W - M}" y2="{H - M + 10}" stroke="#333"/>')
s.append(f'<line x1="{M}" y1="{M + 10}" x2="{M}" y2="{H - M + 10}" stroke="#333"/>')
s.append(f'<text x="{W / 2}" y="{H - 12}" text-anchor="middle">osc of paired tier error, max e − min e (cm)</text>')
s.append(f'<text transform="translate(16 {H / 2}) rotate(-90)" text-anchor="middle">cheap tier margin (cm)</text>')
for fam, osc, mg in pts:
    s.append(f'<circle cx="{X(max(osc, 10**lo)):.1f}" cy="{Y(max(mg, 10**lo)):.1f}" r="4" fill="{COL[fam]}" fill-opacity="0.75"/>')
for i, (fam, c) in enumerate(COL.items()):
    y = 24 + 16 * i
    s.append(f'<circle cx="{W - 230}" cy="{y - 4}" r="4" fill="{c}"/><text x="{W - 220}" y="{y}">{NAME[fam]}</text>')
s.append("</svg>")
(HERE / "margin_vs_osc.svg").write_text("\n".join(s) + "\n")
print("wrote margin_vs_osc.svg", len(pts), "points")
