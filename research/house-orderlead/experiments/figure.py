"""Write experiments/ordering.svg: total cost (interest + holding) against how early materials are ordered, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
secs, cur = {}, None
for l in (HERE / "results.txt").read_text().splitlines():
    if re.match(r"[ABC]\. ", l):
        cur = l[0]
        secs[cur] = []
    m = re.match(r"order ([\d.]+) lead times before plan.*?\s+([\d.]+)\s+[-+][\d.]+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$", l)
    if cur and m:
        secs[cur].append((float(m.group(1)), float(m.group(5))))
if sorted(secs) != list("ABC") or any(len(v) != 8 for v in secs.values()):
    raise SystemExit("no rows parsed")
names = {"A": "default holding cost", "B": "free to hold", "C": "expensive to hold"}
cols = {"A": "#1f6fb2", "B": "#2e8b57", "C": "#c0392b"}
W, H, L, R, T, B = 720, 400, 60, 150, 60, 50
ks = [k for k, _ in secs["A"]]
x = lambda i: L + i / (len(ks) - 1) * (W - L - R)
lo, hi = 2, 10
y = lambda v: H - B - (min(v, hi) - lo) / (hi - lo) * (H - T - B)
f = 'font-family="sans-serif"'
alt = "Total of interest and material holding cost as a percent of house price against how many lead times before plan materials are ordered: " + "; ".join(
    f"{names[s]}: cheapest at {min(secs[s], key=lambda r: r[1])[0]:g}" for s in "ABC")
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Ordering earlier shortens the build, until holding the material costs more</text>',
     f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Interest plus holding cost, % of house price; 3,000 builds per point; stylised, assumed costs</text>']
for g in range(2, 11, 2):
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{y(g):.1f}" y2="{y(g):.1f}" stroke="#ddd"/>')
    o.append(f'<text x="{L-6}" y="{y(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g}</text>')
for i, k in enumerate(ks):
    o.append(f'<text x="{x(i):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{k:g}</text>')
o.append(f'<text x="{(L+W-R)/2}" y="{H-8}" text-anchor="middle" {f} font-size="12">order this many mean lead times before the planned start (20 is about day 0)</text>')
for s in "ABC":
    pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, (_, v) in enumerate(secs[s]))
    o.append(f'<polyline points="{pts}" fill="none" stroke="{cols[s]}" stroke-width="2.5"/>')
    j = min(range(len(ks)), key=lambda i: secs[s][i][1])
    o.append(f'<circle cx="{x(j):.1f}" cy="{y(secs[s][j][1]):.1f}" r="5" fill="{cols[s]}"/>')
    o.append(f'<text x="{W-R+8}" y="{y(secs[s][-1][1])+4:.1f}" {f} font-size="11" fill="{cols[s]}">{names[s]}</text>')
o.append("</svg>")
(HERE / "ordering.svg").write_text("\n".join(o) + "\n")
print("ok")
