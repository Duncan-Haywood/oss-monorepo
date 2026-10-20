"""Plot sweep 1 (and the translational-lift variant, sweep 2) of results.txt: all-up mass against steady wind. Stdlib only."""
import os
here = os.path.dirname(__file__)
lines = open(os.path.join(here, "results.txt")).read().splitlines()

def block(title, ncols):
    i = next(k for k, l in enumerate(lines) if l.startswith(title)) + 2
    rows = []
    while i < len(lines) and lines[i].strip():
        t = lines[i].split()
        rows.append((float(t[0]), [float(x) for x in t[1:1 + ncols]]))
        i += 1
    return rows

s1, s2 = block("# Sweep 1", 3), block("# Sweep 2", 1)
series = [("multirotor", "#1b6ca8", [(w, v[0]) for w, v in s1], ""),
          ("multirotor, translational-lift credit", "#1b6ca8", [(w, v[0]) for w, v in s2], "5,4"),
          ("fixed wing", "#c0392b", [(w, v[1]) for w, v in s1], ""),
          ("VTOL fixed wing", "#2e8b57", [(w, v[2]) for w, v in s1], "")]
W, H = 560, 360
x0, y0, w, h, ymax, xmax = 60, 30, 470, 250, 4.0, 18.0
px = lambda x: x0 + w * x / xmax
py = lambda y: y0 + h * (1 - min(y, ymax) / ymax)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>']
for t in range(5): out.append(f'<text x="{x0-8}" y="{py(t)+4}" text-anchor="end">{t}</text>')
for x in range(0, 19, 3): out.append(f'<text x="{px(x)}" y="{y0+h+16}" text-anchor="middle">{x}</text>')
out.append(f'<text x="{x0+w/2}" y="{y0+h+34}" text-anchor="middle">steady wind (m/s), reference mission: 3 km, 20 min, 0.5 kg payload</text>')
out.append(f'<text x="16" y="{y0+h/2}" transform="rotate(-90 16 {y0+h/2})" text-anchor="middle">all-up mass (kg), clipped at 4</text>')
for k, (name, col, pts, dash) in enumerate(series):
    pts = [(a, b) for a, b in pts if b <= ymax]
    out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" stroke-dasharray="{dash}" points="{" ".join(f"{px(a):.1f},{py(b):.1f}" for a, b in pts)}"/>')
    for a, b in pts: out.append(f'<circle cx="{px(a):.1f}" cy="{py(b):.1f}" r="3" fill="{col}"/>')
    out.append(f'<line x1="{x0+(k%2)*250}" x2="{x0+(k%2)*250+22}" y1="{y0+h+56+(k//2)*16}" y2="{y0+h+56+(k//2)*16}" stroke="{col}" stroke-width="2" stroke-dasharray="{dash}"/>'
               f'<text x="{x0+(k%2)*250+28}" y="{y0+h+60+(k//2)*16}">{name}</text>')
out.append('</svg>')
open(os.path.join(here, "mass_vs_wind.svg"), "w").write("\n".join(out))
