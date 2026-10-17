"""Plot sweep 1 of results.txt: the mass premium paid to design for the q-quantile of a wind distribution. Stdlib only."""
import os
here = os.path.dirname(__file__)
lines = open(os.path.join(here, "results.txt")).read().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("# Sweep 1")) + 2
rows = []
while i < len(lines) and lines[i].strip():
    t = lines[i].split()
    if len(t) >= 10:
        rows.append((int(t[0]), int(t[1]), t[2], float(t[3]), float(t[6])))
    i += 1
cases = [(5, 4, "#1b6ca8"), (8, 3, "#c0392b")]
W, H = 560, 380
x0, y0, w, h, ymax = 60, 30, 470, 250, 30.0
xs = [0.5, 0.8, 0.9, 0.95, 0.99]
px = lambda q: x0 + w * (xs.index(q) + 0.5) / len(xs)
py = lambda y: y0 + h * (1 - y / ymax)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>']
for t in range(0, 31, 5): out.append(f'<text x="{x0-8}" y="{py(t)+4}" text-anchor="end">{t}</text>')
for q in xs: out.append(f'<text x="{px(q)}" y="{y0+h+16}" text-anchor="middle">{q}</text>')
out.append(f'<text x="{x0+w/2}" y="{y0+h+34}" text-anchor="middle">design wind = this quantile of the wind distribution (3 km, 20 min, 0.5 kg)</text>')
out.append(f'<text x="16" y="{y0+h/2}" transform="rotate(-90 16 {y0+h/2})" text-anchor="middle">mass premium over the mean-wind design (%)</text>')
k = 0
for mu, sg, col in cases:
    for kind, dash in (("multirotor", ""), ("fixedwing", "5,4")):
        pts = [(r[3], r[4]) for r in rows if r[0] == mu and r[1] == sg and r[2] == kind]
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" stroke-dasharray="{dash}" points="{" ".join(f"{px(a):.1f},{py(b):.1f}" for a, b in pts)}"/>')
        for a, b in pts: out.append(f'<circle cx="{px(a):.1f}" cy="{py(b):.1f}" r="3" fill="{col}"/>')
        lx, ly = x0 + (k % 2) * 250, y0 + h + 56 + (k // 2) * 16
        out.append(f'<line x1="{lx}" x2="{lx+22}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2" stroke-dasharray="{dash}"/>'
                   f'<text x="{lx+28}" y="{ly+4}">{kind}, wind ~ N({mu}, {sg})</text>')
        k += 1
out.append('</svg>')
open(os.path.join(here, "premium_vs_quantile.svg"), "w").write("\n".join(out))
