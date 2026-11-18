"""Milestone 14 figure: each rule's joint median worst-case regret in five Monte Carlo copies, and pooled.
python3 experiments/m14_pooled/figure.py   (stdlib only; reads verdicts.json, writes copies.svg)"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "verdicts.json")))
rows = d["key"]
W, L, R, T, B = 680, 260, 30, 46, 46
H = T + B + 22 * len(rows)
lo, hi = 0.5, 5.5   # percent
X = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
step = (H - T - B) / len(rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<style>text{fill:#333}.g{stroke:#ccc}.p{fill:#1f6fb2}.m{stroke:#c0392b;stroke-width:2.5}.e{stroke:#c0392b}'
     '@media (prefers-color-scheme:dark){text{fill:#ddd}.g{stroke:#555}.p{fill:#6fb0e8}.m,.e{stroke:#ff8a75}}</style>',
     f'<text x="{L}" y="18">joint median worst-case regret (%): five copies (dots),</text>',
     f'<text x="{L}" y="34">pooled (red bar) &#177; 2 Monte Carlo se</text>']
for t in range(1, 6):
    o.append(f'<line class="g" x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{T}" y2="{H - B}"/>')
    o.append(f'<text x="{X(t):.1f}" y="{H - B + 18}" text-anchor="middle">{t}</text>')
for i, name in enumerate(rows):
    y = T + step * (i + 0.5)
    r = d["rows"][name]
    o.append(f'<text x="{L - 10}" y="{y + 4:.1f}" text-anchor="end">{name}</text>')
    for v in r["copies"]:
        o.append(f'<circle class="p" cx="{X(v * 100):.1f}" cy="{y:.1f}" r="4" fill-opacity="0.6"/>')
    m, s = r["pooled"] * 100, r["se"] * 100
    o.append(f'<line class="e" x1="{X(m - 2 * s):.1f}" x2="{X(m + 2 * s):.1f}" y1="{y:.1f}" y2="{y:.1f}"/>')
    o.append(f'<line class="m" x1="{X(m):.1f}" x2="{X(m):.1f}" y1="{y - 8:.1f}" y2="{y + 8:.1f}"/>')
o.append("</svg>")
open(os.path.join(HERE, "copies.svg"), "w").write("\n".join(o) + "\n")
