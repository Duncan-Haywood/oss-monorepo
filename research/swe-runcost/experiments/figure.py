"""Write experiments/spend_by_track.svg: share of runs and share of spend per track, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
text = (HERE / "results.txt").read_text().splitlines()
rows = []
for l in text:
    m = re.match(r"\s+(\w+)\s+(\d+)\s+([\d.]+)\s+(\d+)%", l)
    if m:
        rows.append((m.group(1), int(m.group(2)), int(m.group(4))))
n = sum(r[1] for r in rows)
W, H, L, T, B = 640, 340, 56, 40, 50
gw = (W - L - 16) / len(rows)
py = lambda v: T + (1 - v / 60) * (H - T - B)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
     f'aria-label="Share of runs and share of spend per track, {n} runs">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">'
     f'Share of runs (blue) and of spend (red) by track, {n} runs</text>']
for v in range(0, 61, 10):
    o.append(f'<line x1="{L}" x2="{W-16}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
             f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v}%</text>')
for i, (t, runs, spend) in enumerate(rows):
    x = L + i * gw + gw * 0.1
    for j, (val, col) in enumerate([(round(100 * runs / n), "#1f6fb2"), (spend, "#c0392b")]):
        bx = x + j * gw * 0.4
        o.append(f'<rect x="{bx:.1f}" y="{py(val):.1f}" width="{gw*0.4:.1f}" height="{py(0)-py(val):.1f}" fill="{col}"/>'
                 f'<text x="{bx+gw*0.2:.1f}" y="{py(val)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{val}%</text>')
    o.append(f'<text x="{x+gw*0.4:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">{t}</text>')
o.append("</svg>")
(HERE / "spend_by_track.svg").write_text("\n".join(o) + "\n")
print("wrote spend_by_track.svg")
