"""Write experiments/orderpass.svg: csel4 cells x depth over the 36 operand orders, with and without opt_merge.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (the `min ... max ...` summary lines), never retyped.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = {}
for line in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"(\w+) (with|without) opt_merge: min (\d+) max (\d+) ratio ([\d.]+)", line)
    if m:
        rows[(m.group(1), m.group(2))] = (int(m.group(3)), int(m.group(4)))
scripts = ["yosys_default", "dch_map", "resyn2_map"]
W, H, L, T = 600, 300, 120, 60
top = max(v[1] for v in rows.values()) * 1.08
px = lambda v: L + (W - L - 20) * v / top
colour = {"with": "#1f6fb2", "without": "#c0392b"}
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="csel4 cells times depth range over 36 operand orders, with and without opt_merge, per ABC script">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="14">16-bit carry-select adder: cells &#215; depth over 36 operand orders</text>']
for i, sc in enumerate(scripts):
    y = T + 70 * i
    o.append(f'<text x="{L-8}" y="{y+12}" text-anchor="end" font-family="sans-serif" font-size="12">{sc}</text>')
    for j, w in enumerate(("with", "without")):
        lo, hi = rows[(sc, w)]
        yy = y + 20 * j
        o.append(f'<rect x="{px(lo):.1f}" y="{yy}" width="{max(px(hi)-px(lo), 2):.1f}" height="14" fill="{colour[w]}" opacity="0.55"/>')
        o.append(f'<text x="{px(hi)+4:.1f}" y="{yy+11}" font-family="sans-serif" font-size="10">{lo} to {hi}</text>')
o.append(f'<text x="{L}" y="{H-24}" font-family="sans-serif" font-size="11" fill="{colour["with"]}">blue: normal flow (opt_merge on)</text>')
o.append(f'<text x="{L}" y="{H-8}" font-family="sans-serif" font-size="11" fill="{colour["without"]}">red: same flow with opt_merge removed (ablation)</text>')
o.append("</svg>")
(HERE / "orderpass.svg").write_text("\n".join(o) + "\n")
