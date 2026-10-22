"""Daily median cost per run by track (SVG, stdlib only), parsed from the committed results.txt."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
rows = {}
for l in open(os.path.join(HERE, "results.txt")):
    m = re.match(r"(research|ventures|process|redteam) ((?:\d\d-\d\d:[\d.]+\(n=\d+\) ?)+)", l)
    if m:
        rows[m.group(1)] = [(a, float(b)) for a, b in re.findall(r"(\d\d-\d\d):([\d.]+)", m.group(2))]
days = sorted({d for v in rows.values() for d, _ in v})
W, H, L, B, T = 560, 340, 50, 40, 34
top = 1.2
px = lambda i: L + i * (W - L - 20) / (len(days) - 1)
py = lambda y: H - B - y / top * (H - B - T)
cols = {"research": "#c0392b", "ventures": "#1f6fb2", "process": "#2e8b57", "redteam": "#8e44ad"}
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Daily median cost per run by track">',
     '<style>text{font:12px sans-serif;fill:#222}</style><rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="18">Daily median cost per run (USD), days with at least 5 runs</text>']
for v in (0, 0.4, 0.8, 1.2):
    o.append(f'<text x="8" y="{py(v) + 4:.0f}">${v:g}</text><line x1="{L}" x2="{W - 20}" y1="{py(v):.0f}" y2="{py(v):.0f}" stroke="#eee"/>')
for i, d in enumerate(days):
    o.append(f'<text x="{px(i) - 14:.0f}" y="{H - B + 16}">{d}</text>')
for k, (t, v) in enumerate(rows.items()):
    pts = " ".join(f"{px(days.index(d)):.1f},{py(y):.1f}" for d, y in v)
    o.append(f'<polyline points="{pts}" fill="none" stroke="{cols[t]}" stroke-width="2"/>')
    o.append(f'<text x="{L + 8 + k * 100}" y="{H - 8}" style="fill:{cols[t]}">{t}</text>')
o.append("</svg>")
open(os.path.join(HERE, "cost_by_day.svg"), "w").write("\n".join(o))
