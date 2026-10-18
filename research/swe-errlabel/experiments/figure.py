"""Write experiments/precision_recall.svg: per-class precision and recall of the keyword rules, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"\s+([\w-]+)\s+\d+\s+\d+\s+\d+\s+precision\s+(\S+)\s+recall\s+(\S+)$", l)
    if m:
        pct = lambda s: None if s == "n/a" else int(s.rstrip("%"))
        rows.append((m.group(1), pct(m.group(2)), pct(m.group(3))))
W, RH, L, T = 640, 44, 120, 58
H = T + RH * len(rows) + 12
sc = (W - L - 70) / 100
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Precision and recall of the keyword error classes against hand labels">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     '<text x="16" y="22" font-family="sans-serif" font-size="14">Keyword rules vs hand labels, 60 entries: precision (blue) and recall (orange)</text>',
     '<text x="16" y="40" font-family="sans-serif" font-size="12" fill="#555">n/a = the rule assigned nothing</text>']
for i, (c, p, r) in enumerate(rows):
    y = T + i * RH
    o.append(f'<text x="{L-8}" y="{y+17}" text-anchor="end" font-family="sans-serif" font-size="13">{c}</text>')
    for k, (v, col) in enumerate(((p, "#2563eb"), (r, "#d97706"))):
        yy = y + 2 + k * 18
        if v is None:
            o.append(f'<text x="{L}" y="{yy+12}" font-family="sans-serif" font-size="12" fill="#555">n/a</text>')
        else:
            o.append(f'<rect x="{L}" y="{yy}" width="{max(v*sc,1):.1f}" height="15" fill="{col}"/>')
            o.append(f'<text x="{L+v*sc+6:.1f}" y="{yy+12}" font-family="sans-serif" font-size="12">{v}%</text>')
o.append("</svg>")
(HERE / "precision_recall.svg").write_text("\n".join(o))
print("ok")
