"""Write experiments/cost_per_merged.svg: cost per merged run and per priced run by track, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = []
for l in (HERE / "results.txt").read_text().splitlines():
    m = re.match(r"\s+(\w+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+% \(\d+-\d+\)\s+([\d.]+) \([\d.]+ to [\d.]+\)\s+([\d.]+)", l)
    if m:
        rows.append((m.group(1), int(m.group(2)), float(m.group(5)), float(m.group(6))))
top = max(r[2] for r in rows) * 1.1
W, H, L, T, B = 640, 340, 56, 40, 50
gw = (W - L - 16) / len(rows)
py = lambda v: T + (1 - v / top) * (H - T - B)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Cost per merged run and per priced run, by track">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="22" font-family="sans-serif" font-size="14">Dollars per merged run (blue) and per priced run (grey), by track</text>']
for i, (t, n, pm, pr) in enumerate(rows):
    x = L + i * gw + gw * 0.12
    bw = gw * 0.34
    for j, (v, c) in enumerate([(pm, "#2b6cb0"), (pr, "#999")]):
        y = py(v)
        o.append(f'<rect x="{x + j * bw:.1f}" y="{y:.1f}" width="{bw - 2:.1f}" height="{py(0) - y:.1f}" fill="{c}"/>')
        o.append(f'<text x="{x + j * bw + bw / 2 - 1:.1f}" y="{y - 4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v:.2f}</text>')
    o.append(f'<text x="{x + bw:.1f}" y="{H - B + 18}" text-anchor="middle" font-family="sans-serif" font-size="12">{t} (n={n})</text>')
o.append(f'<line x1="{L}" y1="{py(0)}" x2="{W - 16}" y2="{py(0)}" stroke="#333"/></svg>')
(HERE / "cost_per_merged.svg").write_text("\n".join(o) + "\n")
