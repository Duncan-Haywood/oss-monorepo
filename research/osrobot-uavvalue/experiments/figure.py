"""Plot results.txt: design limit L and launch threshold T against the value of a completed observation. Stdlib only."""
import os
here = os.path.dirname(__file__)
rows = []
for l in open(os.path.join(here, "results.txt")):
    t = l.replace("|", " ").split()
    if l.startswith("#") or len(t) < 18: continue
    rows.append((int(t[0]), int(t[1]), t[2], int(float(t[3])), int(t[4]), int(t[5]), float(t[6]), float(t[7])))
sel = [r for r in rows if r[:5] == (5, 4, "mr", 30000, 2)]
W, H = 560, 330
x0, y0, w, h, ymax = 60, 30, 470, 230, 16
py = lambda y: y0 + h * (1 - y / ymax)
px = lambda i: x0 + w * (i + 0.5) / len(sel)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>']
for t in (0, 4, 8, 12, 16): out.append(f'<text x="{x0-8}" y="{py(t)+4}" text-anchor="end">{t}</text>')
for i, r in enumerate(sel): out.append(f'<text x="{px(i)}" y="{y0+h+16}" text-anchor="middle">V = ${r[5]}</text>')
out.append(f'<text x="{x0+w/2}" y="{y0+h+34}" text-anchor="middle">value of a completed observation; multirotor, wind ~ N(5, 4), forecast error 2 m/s, $30000/kg</text>')
out.append(f'<text x="16" y="{y0+h/2}" transform="rotate(-90 16 {y0+h/2})" text-anchor="middle">wind (m/s)</text>')
for k, (name, j, col) in enumerate((("design limit L (airframe sized for)", 6, "#1b6ca8"), ("launch threshold T (launch if forecast at most)", 7, "#c0392b"))):
    for i, r in enumerate(sel): out.append(f'<circle cx="{px(i)+(k-0.5)*14:.1f}" cy="{py(r[j]):.1f}" r="5" fill="{col}"/>')
    ly = y0 + h + 52 + k * 16
    out.append(f'<circle cx="{x0+8}" cy="{ly}" r="5" fill="{col}"/><text x="{x0+22}" y="{ly+4}">{name}</text>')
out.append('</svg>')
open(os.path.join(here, "limit_vs_threshold.svg"), "w").write("\n".join(out))
