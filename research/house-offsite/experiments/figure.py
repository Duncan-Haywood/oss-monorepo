"""Write experiments/size.svg: shell calendar days, site-built against panelised, by house length (experiment E).

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows, on = [], False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("E."):
        on = True
        continue
    if on and not l.strip():
        break
    m = re.match(r"\s*(\d+)\s+\d+\s+\d+\s+([\d.]+)\s+([\d.]+)\s+[\d,]+\s+[\d,]+\s+[-+][\d.]+", l)
    if on and m:
        rows.append((int(m.group(1)), float(m.group(2)), float(m.group(3))))
if len(rows) != 6:
    raise SystemExit("no rows parsed")
W, H, L, R, T, B = 640, 340, 60, 30, 60, 50
px = lambda v: L + (v - 24) / (120 - 24) * (W - L - R)
py = lambda v: H - B - v / 3.5 * (H - T - B)
f = 'font-family="sans-serif"'
alt = "Calendar days of the wall shell by house length, site-built and panelised: " + "; ".join(
    f"{n} ft: {s:.2f} and {o:.2f}" for n, s, o in rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Calendar days of the wall shell, by house length</text>',
     f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Mean of 4,000 draws, 15% weather loss; stylised, every rate assumed</text>']
for g in (0, 1, 2, 3):
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="#ddd"/>')
    o.append(f'<text x="{L-8}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g}</text>')
for n, _, _ in rows:
    o.append(f'<text x="{px(n):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{n}</text>')
o.append(f'<text x="{(L+W-R)/2}" y="{H-8}" text-anchor="middle" {f} font-size="11">house length (ft), 28 ft wide</text>')
for k, (name, c) in enumerate((("site-built", "#444"), ("panelised", "#b5651d"))):
    pts = " ".join(f"{px(r[0]):.1f},{py(r[1 + k]):.1f}" for r in rows)
    o.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2.5"/>')
    for r in rows:
        o.append(f'<circle cx="{px(r[0]):.1f}" cy="{py(r[1 + k]):.1f}" r="3.5" fill="{c}"/>')
    o.append(f'<text x="{W-R-4}" y="{py(rows[-1][1 + k]) + (-8 if k == 0 else 16):.1f}" text-anchor="end" {f} font-size="11" fill="{c}">{name}</text>')
o.append("</svg>")
(HERE / "size.svg").write_text("\n".join(o) + "\n")
print("ok")
