"""Write experiments/coverage.svg: process-alone coverage, count-weighted vs mass-weighted, family 'log' with load.

    python3 experiments/figure.py      (numbers parsed from results.txt, never retyped)
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
txt = (HERE / "results.txt").read_text().split("\n## ")
sec = next(s for s in txt if "family 'log', with tip load" in s)
rows = [(m[1], float(m[2]), float(m[3])) for l in sec.splitlines() if (m := re.match(r"\s+(\w+)\s+count ([\d.]+)\s+mass ([\d.]+)", l)) and m[1] in ("fdm", "cnc", "laser", "cast")][:4]
W, H, L, B, T = 560, 340, 56, 50, 50
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Grouped bars of the share of parts each process covers, counting parts equally and weighting by mass: FDM 0.30 vs 0.58, casting 0.22 vs 0.46, CNC 0.16 vs 0.26, laser 0.18 vs 0.18">',
       f'<rect width="{W}" height="{H}" fill="#fff"/>',
       f'<text x="{W/2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="14">Coverage by each process alone: count vs mass weighted (with load)</text>']
for t in (0, .2, .4, .6):
    y = H - B - (H - B - T) * t / 0.6
    out.append(f'<line x1="{L}" x2="{W-10}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/><text x="{L-6}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{t:.1f}</text>')
gw = (W - L - 10) / len(rows)
for i, (n, c, m) in enumerate(rows):
    for j, (v, col) in enumerate(((c, "#1f6fb2"), (m, "#c0392b"))):
        h = (H - B - T) * v / 0.6
        x = L + i * gw + gw * (0.15 + 0.35 * j)
        out.append(f'<rect x="{x:.1f}" y="{H-B-h:.1f}" width="{gw*0.32:.1f}" height="{h:.1f}" fill="{col}"/><text x="{x+gw*0.16:.1f}" y="{H-B-h-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v:.2f}</text>')
    out.append(f'<text x="{L+i*gw+gw/2:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="12">{n}</text>')
out.append(f'<text x="{L}" y="{H-8}" font-family="sans-serif" font-size="11" fill="#1f6fb2">blue: parts counted equally</text><text x="{L+170}" y="{H-8}" font-family="sans-serif" font-size="11" fill="#c0392b">red: weighted by volume (mass proxy)</text></svg>')
(HERE / "coverage.svg").write_text("\n".join(out))
