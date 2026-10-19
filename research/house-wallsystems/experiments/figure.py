"""Write experiments/systems.svg: first cost and 30-year heat-loss cost per wall system (midpoints), parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for l in (HERE / "results.txt").read_text().split("\nB.")[0].splitlines():
    m = re.match(r"(.+?)\s+([\d,]+)\s+[\d.]+\s+[\d,]+\s+\d+\s+[\d,]+\s+([\d,]+)\s+[\d,]+$", l)
    if m:
        rows.append((m.group(1), int(m.group(2).replace(",", "")), int(m.group(3).replace(",", ""))))
if len(rows) != 6:
    raise SystemExit("no rows parsed")
W, H, L, R, T, B = 640, 380, 190, 30, 60, 40
mx = 25000
px = lambda v: L + v / mx * (W - L - R)
bh = (H - T - B) / len(rows)
f = 'font-family="sans-serif"'
alt = "Bar chart of wall cost plus 30-year heat-loss cost by wall system: " + "; ".join(f"{n} ${a + b:,}" for n, a, b in rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Wall first cost plus 30-year heat-loss cost, 927 sq ft of wall</text>',
     f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Stylised midpoint inputs from memory; US dollars</text>']
for g in range(0, mx + 1, 5000):
    o.append(f'<line x1="{px(g):.1f}" x2="{px(g):.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/>')
    o.append(f'<text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">${g//1000}k</text>')
for i, (n, a, b) in enumerate(rows):
    y = T + i * bh + 6
    o.append(f'<text x="{L-8}" y="{y + bh/2:.1f}" text-anchor="end" {f} font-size="12">{n}</text>')
    o.append(f'<rect x="{L}" y="{y:.1f}" width="{px(a)-L:.1f}" height="{bh-12:.1f}" fill="#1b6ca8"/>')
    o.append(f'<rect x="{px(a):.1f}" y="{y:.1f}" width="{px(a+b)-px(a):.1f}" height="{bh-12:.1f}" fill="#d9822b"/>')
o.append(f'<rect x="{L}" y="{H-14}" width="10" height="10" fill="#1b6ca8"/><text x="{L+14}" y="{H-5}" {f} font-size="11">first cost</text>')
o.append(f'<rect x="{L+90}" y="{H-14}" width="10" height="10" fill="#d9822b"/><text x="{L+104}" y="{H-5}" {f} font-size="11">30-year heat loss (present value)</text>')
o.append("</svg>")
(HERE / "systems.svg").write_text("\n".join(o) + "\n")
print("wrote systems.svg")
