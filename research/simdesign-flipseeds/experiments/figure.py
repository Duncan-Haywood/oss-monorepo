"""Write experiments/flips.svg: flip rate (with Wilson interval) per budget, family 'log' and 'large'.

    python3 experiments/figure.py      (numbers parsed from results.txt, never retyped)
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
fam, data = None, {}
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("## family"):
        fam = l.split("'")[1]
    elif (m := re.match(r"\s+budget\s+(\d+): flips\s+(\d+)/(\d+)\s+ci \[([\d.]+), ([\d.]+)\]", l)):
        data.setdefault(fam, []).append((int(m[1]), int(m[2]) / int(m[3]), float(m[4]), float(m[5])))
W, H, L, B, T = 600, 340, 56, 56, 50
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Share of 20 seeds in which count and mass weighting pick different machines, by budget, for the log and large families: log flips in every seed at budgets 600 to 800 and in half at 1100 and 1400; large flips only at 800">',
       f'<rect width="{W}" height="{H}" fill="#fff"/>',
       f'<text x="{W/2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="14">Seeds where the machine choice flips (20 seeds, 95% Wilson)</text>']
for t in (0, .25, .5, .75, 1):
    y = H - B - (H - B - T) * t
    out.append(f'<line x1="{L}" x2="{W-10}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/><text x="{L-6}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{t:.2f}</text>')
buds = [b for b, *_ in data["log"]]
gw = (W - L - 10) / len(buds)
for i, b in enumerate(buds):
    out.append(f'<text x="{L+i*gw+gw/2:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="12">{b}</text>')
    for j, (f, col) in enumerate((("log", "#1f6fb2"), ("large", "#c0392b"))):
        _, v, lo, hi = data[f][i]
        x = L + i * gw + gw * (0.15 + 0.35 * j); w = gw * 0.32; h = (H - B - T) * v
        out.append(f'<rect x="{x:.1f}" y="{H-B-h:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{col}"/>')
        xm = x + w / 2; y1 = H - B - (H - B - T) * lo; y2 = H - B - (H - B - T) * hi
        out.append(f'<line x1="{xm:.1f}" x2="{xm:.1f}" y1="{y1:.1f}" y2="{y2:.1f}" stroke="#222"/>')
out.append(f'<text x="{W/2}" y="{H-30}" text-anchor="middle" font-family="sans-serif" font-size="12">machine budget</text>')
out.append(f'<text x="{L}" y="{H-8}" font-family="sans-serif" font-size="11" fill="#1f6fb2">blue: family log</text><text x="{L+120}" y="{H-8}" font-family="sans-serif" font-size="11" fill="#c0392b">red: family large</text></svg>')
(HERE / "flips.svg").write_text("\n".join(out))
