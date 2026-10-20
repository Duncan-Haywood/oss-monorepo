"""Write experiments/orderblocks.svg: dch_map cells x depth per shared-block set, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for line in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"(\(.*?\))\s+(\d+)\s+\d+ \((\d+)\.\.\d+\)\s+\d+ \((\d+)\.\.\d+\)\s+\d+ \((\d+)\.\.\d+\)", line)
    if m:
        rows.append((m.group(1), int(m.group(2)), int(m.group(4))))
W, H, L = 600, 40 + 30 * len(rows) + 30, 110
top = max(r[2] for r in rows) * 1.12
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="csel4 dch_map cells times depth by set of blocks sharing a+b">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">csel4, dch_map: cells &#215; depth by which blocks share a+b</text>']
for i, (k, n, v) in enumerate(rows):
    y = 40 + 30 * i
    w = (W - L - 80) * v / top
    o.append(f'<text x="{L-8}" y="{y+13}" text-anchor="end" font-family="sans-serif" font-size="12">{k}</text>')
    o.append(f'<rect x="{L}" y="{y}" width="{w:.1f}" height="18" fill="#1f6fb2" opacity="0.6"/>')
    o.append(f'<text x="{L+w+4:.1f}" y="{y+13}" font-family="sans-serif" font-size="11">{v} (n={n})</text>')
o.append(f'<text x="{L}" y="{H-8}" font-family="sans-serif" font-size="11">() = no block shares; every set had one score across all its sampled variants</text>')
o.append("</svg>")
(HERE / "orderblocks.svg").write_text("\n".join(o) + "\n")
