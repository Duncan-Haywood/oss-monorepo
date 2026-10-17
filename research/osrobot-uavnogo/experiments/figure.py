"""Plot results.txt: share of launches that fail against forecast error, per limit quantile. Stdlib only."""
import os
here = os.path.dirname(__file__)
rows = []
for l in open(os.path.join(here, "results.txt")):
    t = l.split()
    if l.startswith("#") or len(t) < 11: continue
    rows.append((int(t[0]), int(t[1]), t[2], float(t[3]), int(t[6]), float(t[8]), float(t[7])))
W, H = 560, 380
x0, y0, w, h, ymax = 60, 30, 470, 250, 0.15
px = lambda s: x0 + w * s / 3
py = lambda y: y0 + h * (1 - y / ymax)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>']
for t in (0, 0.05, 0.10, 0.15): out.append(f'<text x="{x0-8}" y="{py(t)+4}" text-anchor="end">{t:.2f}</text>')
for s in range(4): out.append(f'<text x="{px(s)}" y="{y0+h+16}" text-anchor="middle">{s}</text>')
out.append(f'<text x="{x0+w/2}" y="{y0+h+34}" text-anchor="middle">forecast error sd (m/s); fixed wing, wind ~ N(5, 4), 3 km, 20 min, 0.5 kg</text>')
out.append(f'<text x="16" y="{y0+h/2}" transform="rotate(-90 16 {y0+h/2})" text-anchor="middle">P(launched and failed) per attempt</text>')
for k, (q, col) in enumerate(((0.5, "#c0392b"), (0.8, "#e08e0b"), (0.95, "#1b6ca8"))):
    pts = [(r[4], r[5]) for r in rows if r[0] == 5 and r[1] == 4 and r[2] == "fixedwing" and r[3] == q]
    out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{" ".join(f"{px(a):.1f},{py(b):.1f}" for a, b in pts)}"/>')
    for a, b in pts: out.append(f'<circle cx="{px(a):.1f}" cy="{py(b):.1f}" r="3" fill="{col}"/>')
    ly = y0 + h + 56 + k * 16
    out.append(f'<line x1="{x0}" x2="{x0+22}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/><text x="{x0+28}" y="{ly+4}">no-go limit = {q} quantile of wind</text>')
out.append('</svg>')
open(os.path.join(here, "fail_vs_forecast_error.svg"), "w").write("\n".join(out))
