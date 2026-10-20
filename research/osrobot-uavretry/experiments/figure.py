"""Plot results.txt: P(complete by end of day) against slots per day, per wind persistence. Stdlib only."""
import os
here = os.path.dirname(__file__)
rows = []
for l in open(os.path.join(here, "results.txt")):
    t = l.split()
    if l.startswith("#") or len(t) < 11: continue
    rows.append((float(t[0]), int(t[3]), float(t[4]), int(t[5]), float(t[6])))
W, H = 560, 400
x0, y0, w, h = 60, 30, 470, 250
px = lambda k: x0 + w * (k - 1) / 7
py = lambda y: y0 + h * (1 - y)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>']
for t in (0, 0.25, 0.5, 0.75, 1): out.append(f'<text x="{x0-8}" y="{py(t)+4}" text-anchor="end">{t:.2f}</text>')
for k in (1, 2, 4, 8): out.append(f'<text x="{px(k)}" y="{y0+h+16}" text-anchor="middle">{k}</text>')
out.append(f'<text x="{x0+w/2}" y="{y0+h+34}" text-anchor="middle">launch slots per day; fixed wing, wind ~ N(5, 4), limit = median wind, perfect forecast</text>')
out.append(f'<text x="16" y="{y0+h/2}" transform="rotate(-90 16 {y0+h/2})" text-anchor="middle">P(mission completed that day)</text>')
for i, (rho, col) in enumerate(((0.0, "#1b6ca8"), (0.5, "#2e9e5b"), (0.8, "#e08e0b"), (0.95, "#c0392b"))):
    pts = [(r[3], r[4]) for r in rows if r[0] == 0.5 and r[1] == 0 and r[2] == rho]
    out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{" ".join(f"{px(a):.1f},{py(b):.1f}" for a, b in pts)}"/>')
    for a, b in pts: out.append(f'<circle cx="{px(a):.1f}" cy="{py(b):.1f}" r="3" fill="{col}"/>')
    ly = y0 + h + 54 + i * 16
    out.append(f'<line x1="{x0}" x2="{x0+22}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/><text x="{x0+28}" y="{ly+4}">wind persistence rho = {rho}</text>')
out.append('</svg>')
open(os.path.join(here, "complete_vs_slots.svg"), "w").write("\n".join(out))
