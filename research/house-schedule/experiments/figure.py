"""Write experiments/schedule.svg: mean build time and p10-p90 range per scenario, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"(.+?)\s{2,}([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+[-+][\d.]+\s+[\d.]+\s+[\d.]+", l)
    if m and not l.startswith("scenario"):
        rows.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))))
if len(rows) != 8:
    raise SystemExit("no rows parsed")
W, H, L, R, T, B = 760, 380, 330, 30, 60, 40
hi = 260
px = lambda v: L + v / hi * (W - L - R)
rh = (H - T - B) / len(rows)
f = 'font-family="sans-serif"'
alt = "Mean and 10th to 90th percentile build time in working days: " + "; ".join(
    f"{n}: {m:.0f} ({a:.0f} to {b:.0f})" for n, m, a, b in rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Working days to build a house, by lever</text>',
     f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Mean (bar) and 10th to 90th percentile (line), 4,000 builds each; stylised, assumed durations</text>']
for g in range(0, 261, 50):
    o.append(f'<line x1="{px(g):.1f}" x2="{px(g):.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/>')
    o.append(f'<text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{g}</text>')
for k, (n, m, a, b) in enumerate(rows):
    y = T + k * rh + 4
    h = rh - 8
    c = "#444" if k == 0 else "#b5651d"
    o.append(f'<text x="{L-8}" y="{y+h/2+4:.1f}" text-anchor="end" {f} font-size="11">{n}</text>')
    o.append(f'<rect x="{L}" y="{y:.1f}" width="{px(m)-L:.1f}" height="{h:.1f}" fill="{c}" opacity="0.8"/>')
    o.append(f'<line x1="{px(a):.1f}" x2="{px(b):.1f}" y1="{y+h/2:.1f}" y2="{y+h/2:.1f}" stroke="#000" stroke-width="2"/>')
    o.append(f'<text x="{px(b)+6:.1f}" y="{y+h/2+4:.1f}" {f} font-size="11">{m:.0f}</text>')
o.append("</svg>")
(HERE / "schedule.svg").write_text("\n".join(o) + "\n")
print("ok")
