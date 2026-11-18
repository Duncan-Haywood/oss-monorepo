"""Milestone 13 figure: each key rule's joint median worst-case regret in five Monte Carlo copies.
python3 experiments/m13_streams/figure.py   (stdlib only; reads verdicts.json, writes copies.svg)"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "verdicts.json")))
W, H, L, R, T, B = 640, 300, 250, 30, 40, 50
lo, hi = 0.5, 2.5   # percent
X = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
rows = d["key"]
step = (H - T - B) / len(rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<style>text{fill:#333}.g{stroke:#ccc}.p{fill:#1f6fb2}.m{stroke:#c0392b;stroke-width:2}'
     '@media (prefers-color-scheme:dark){text{fill:#ddd}.g{stroke:#555}.p{fill:#6fb0e8}}</style>',
     f'<text x="{L}" y="20">joint median worst-case regret (%), five Monte Carlo copies; red = mean</text>']
for t in (0.5, 1.0, 1.5, 2.0, 2.5):
    o.append(f'<line class="g" x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{T}" y2="{H - B}"/>')
    o.append(f'<text x="{X(t):.1f}" y="{H - B + 18}" text-anchor="middle">{t:g}</text>')
for i, name in enumerate(rows):
    y = T + step * (i + 0.5)
    o.append(f'<text x="{L - 10}" y="{y + 4:.1f}" text-anchor="end">{name}</text>')
    vals = [r[i] * 100 for r in d["median_per_copy"]]
    for v in vals:
        o.append(f'<circle class="p" cx="{X(v):.1f}" cy="{y:.1f}" r="5" fill-opacity="0.7"/>')
    m = sum(vals) / len(vals)
    o.append(f'<line class="m" x1="{X(m):.1f}" x2="{X(m):.1f}" y1="{y - 10:.1f}" y2="{y + 10:.1f}"/>')
o.append("</svg>")
open(os.path.join(HERE, "copies.svg"), "w").write("\n".join(o) + "\n")
