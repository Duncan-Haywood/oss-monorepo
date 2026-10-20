"""Write experiments/schedule.svg: mean and p90 calendar days per scenario, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"\s{3}(\S.*?)\s{2,}(\d+) \(([-+][\d.]+)%\)\s+(\d+)\s", l)
    if m:
        rows.append((m.group(1), int(m.group(2)), int(m.group(4))))
if len(rows) != 5:
    raise SystemExit("no rows parsed")
W, H, L, R, T, B = 700, 300, 230, 40, 60, 36
hi = 260
px = lambda v: L + v / hi * (W - L - R)
rh = (H - T - B) / len(rows)
f = 'font-family="sans-serif"'
alt = "Bar chart of mean and 90th-percentile calendar days to build a stylised house under five scheduling scenarios: " + "; ".join(f"{n}: mean {a}, p90 {b}" for n, a, b in rows)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Calendar days to complete a stylised house build</text>',
     f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">4,000 simulated builds per scenario; every input is an assumption</text>']
for g in range(0, 261, 50):
    o.append(f'<line x1="{px(g):.1f}" x2="{px(g):.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/><text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{g}</text>')
for k, (n, a, b) in enumerate(rows):
    y = T + k * rh + 2
    h = (rh - 4) / 2
    o.append(f'<rect x="{px(0):.1f}" y="{y:.1f}" width="{px(a)-px(0):.1f}" height="{h:.1f}" fill="#b5651d"/>')
    o.append(f'<rect x="{px(0):.1f}" y="{y+h:.1f}" width="{px(b)-px(0):.1f}" height="{h:.1f}" fill="#444"/>')
    o.append(f'<text x="{L-8}" y="{y+h+4:.1f}" text-anchor="end" {f} font-size="11">{n}</text>')
    o.append(f'<text x="{px(b)+4:.1f}" y="{y+h+4:.1f}" {f} font-size="10">{a} / {b}</text>')
o.append(f'<rect x="{L}" y="46" width="10" height="10" fill="#b5651d"/><text x="{L+14}" y="55" {f} font-size="11">mean</text><rect x="{L+60}" y="46" width="10" height="10" fill="#444"/><text x="{L+74}" y="55" {f} font-size="11">90th percentile</text>')
o.append("</svg>")
(HERE / "schedule.svg").write_text("\n".join(o) + "\n")
print("wrote", HERE / "schedule.svg")
