"""Write experiments/error_categories.svg: share of recorded error entries by category, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"\s+([\w-]+)\s+(\d+)\s+([\d.]+)%$", l)
    if m:
        rows.append((m.group(1), int(m.group(2)), float(m.group(3))))
W, RH, L, T = 640, 34, 120, 44
H = T + RH * len(rows) + 16
top = max(r[2] for r in rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Share of recorded error entries by category">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="16" y="24" font-family="sans-serif" font-size="14">Share of 222 recorded error entries, by keyword category</text>']
for i, (c, n, p) in enumerate(rows):
    y = T + i * RH
    w = (W - L - 80) * p / top
    o.append(f'<text x="{L-8}" y="{y+19}" text-anchor="end" font-family="sans-serif" font-size="13">{c}</text>')
    o.append(f'<rect x="{L}" y="{y+4}" width="{w:.1f}" height="22" fill="#2563eb"/>')
    o.append(f'<text x="{L+w+6:.1f}" y="{y+20}" font-family="sans-serif" font-size="13">{p}% ({n})</text>')
o.append("</svg>")
(HERE / "error_categories.svg").write_text("\n".join(o))
print("ok")
