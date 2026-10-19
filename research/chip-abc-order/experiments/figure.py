"""Write experiments/csel4_order.svg: range of cells x depth for csel4 over operand-order variants, per ABC script.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (the `permute` column), never retyped.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("csel4 "):
        f = line.split()
        base = int(f[2])
        lo, hi = map(int, re.findall(r"(\d+)-(\d+)", line)[2])  # third range column = permute
        rows.append((f[1], base, lo, hi))
W, H, L, T = 560, 260, 120, 50
top = max(r[3] for r in rows) * 1.08
px = lambda v: L + (W - L - 20) * v / top
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="csel4 cells times depth range under operand-order rewrites, per ABC script">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="14">16-bit carry-select adder: cells &#215; depth over 12 operand orders</text>']
for i, (sc, base, lo, hi) in enumerate(rows):
    y = T + 60 * i
    o.append(f'<text x="{L-8}" y="{y+5}" text-anchor="end" font-family="sans-serif" font-size="12">{sc}</text>')
    o.append(f'<rect x="{px(lo):.1f}" y="{y-9}" width="{px(hi)-px(lo):.1f}" height="18" fill="#1f6fb2" opacity="0.35"/>')
    o.append(f'<line x1="{px(base):.1f}" x2="{px(base):.1f}" y1="{y-13}" y2="{y+13}" stroke="#c0392b" stroke-width="3"/>')
    o.append(f'<text x="{px(lo):.1f}" y="{y+26}" font-family="sans-serif" font-size="10">{lo}</text>')
    o.append(f'<text x="{px(hi):.1f}" y="{y+26}" text-anchor="end" font-family="sans-serif" font-size="10">{hi}</text>')
o.append(f'<text x="{L}" y="{H-8}" font-family="sans-serif" font-size="11">blue band = min to max over variants; red tick = text as generated</text>')
o.append("</svg>")
(HERE / "csel4_order.svg").write_text("\n".join(o) + "\n")
