"""Write experiments/pricebands.svg: material-flip share vs budget at price spreads 0, 0.1, 0.2 (families log, large).

    python3 experiments/figure.py      (numbers parsed from results.txt, never retyped)
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
fam, data = None, {}
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("## family"):
        fam = l.split("'")[1]
    elif (m := re.match(r"\s+spread ([\d.]+)\s+budget:any/mat\s+(.*)", l)):
        data[(fam, float(m[1]))] = [(int(b), float(mat)) for b, _, mat in re.findall(r"(\d+):([\d.]+)/([\d.]+)", m[2])]
W, H, L, B, T = 640, 330, 52, 50, 46
cols = {0.0: "#222", 0.1: "#1f6fb2", 0.2: "#c0392b"}
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Share of price draws where the count-weighted machine pick gives up more than 0.5 points of mass coverage, by budget, for price spreads 0, 10 and 20 percent; the budget band where the weightings disagree widens as prices are perturbed">',
       f'<rect width="{W}" height="{H}" fill="#fff"/>']
for k, f in enumerate(("log", "large")):
    x0, w = L + k * (W - L) / 2, (W - L) / 2 - 14
    out.append(f'<text x="{x0+w/2:.0f}" y="22" text-anchor="middle" font-family="sans-serif" font-size="13">family {f}: material flip share</text>')
    for t in (0, .5, 1):
        y = H - B - (H - B - T) * t
        out.append(f'<line x1="{x0}" x2="{x0+w}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>')
        if k == 0:
            out.append(f'<text x="{x0-5}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{t:.1f}</text>')
    pts = data[(f, 0.0)]
    bs = [b for b, _ in pts]
    X = lambda b: x0 + w * (b - bs[0]) / (bs[-1] - bs[0])
    for b in bs[::2]:
        out.append(f'<text x="{X(b):.1f}" y="{H-B+15}" text-anchor="middle" font-family="sans-serif" font-size="11">{b}</text>')
    for s, c in cols.items():
        d = " ".join(f"{X(b):.1f},{H-B-(H-B-T)*v:.1f}" for b, v in data[(f, s)])
        out.append(f'<polyline points="{d}" fill="none" stroke="{c}" stroke-width="2"/>')
out.append(f'<text x="{W/2}" y="{H-24}" text-anchor="middle" font-family="sans-serif" font-size="12">machine budget</text>')
for i, (s, c) in enumerate(cols.items()):
    out.append(f'<text x="{L+i*130}" y="{H-6}" font-family="sans-serif" font-size="11" fill="{c}">price spread &#177;{int(s*100)}%</text>')
out.append("</svg>")
(HERE / "pricebands.svg").write_text("\n".join(out))
