"""Plot sweep 1 and sweep 2 of results.txt (mass against loiter time and against distance) as SVG, stdlib only."""
import os, re
here = os.path.dirname(__file__)
lines = open(os.path.join(here, "results.txt")).read().splitlines()

def block(title):
    i = next(k for k, l in enumerate(lines) if l.startswith(title)) + 2
    rows = []
    while i < len(lines) and lines[i].strip():
        t = lines[i].split()
        rows.append((float(t[0]), [None if x == "none" else float(x) for x in t[1:4]]))
        i += 1
    return rows

panels = [("Loiter time on station (min), 3 km out", block("# Sweep 1")), ("Distance to the site (km), 10 min on station", block("# Sweep 2"))]
cols = ["#1b6ca8", "#c0392b", "#2e8b57"]; names = ["multirotor", "fixed wing", "VTOL fixed wing"]
W, H, M = 760, 330, 55
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>']
for p, (title, rows) in enumerate(panels):
    x0 = 50 + p * 370; w = 300; y0 = 40; h = H - y0 - M
    xs = [r[0] for r in rows]; ymax = 4.0
    px = lambda x: x0 + w * (x - min(xs)) / (max(xs) - min(xs)); py = lambda y: y0 + h * (1 - min(y, ymax) / ymax)
    out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>')
    out.append(f'<text x="{x0}" y="{y0-12}">{title}</text>')
    for t in range(0, 5):
        out.append(f'<text x="{x0-8}" y="{py(t)+4}" text-anchor="end">{t}</text>')
    for x in xs:
        out.append(f'<text x="{px(x)}" y="{y0+h+16}" text-anchor="middle" font-size="10">{x:g}</text>')
    for c in range(3):
        pts = [(px(x), py(v[c])) for x, v in rows if v[c] is not None and v[c] <= ymax]
        out.append(f'<polyline fill="none" stroke="{cols[c]}" stroke-width="2" points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
        for a, b in pts: out.append(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3" fill="{cols[c]}"/>')
out.append(f'<text x="14" y="{H/2}" transform="rotate(-90 14 {H/2})" text-anchor="middle">all-up mass (kg), 0.5 kg payload</text>')
for c in range(3):
    out.append(f'<rect x="{150+c*160}" y="{H-24}" width="14" height="4" fill="{cols[c]}"/><text x="{170+c*160}" y="{H-18}">{names[c]}</text>')
out.append('</svg>')
open(os.path.join(here, "mass_sweeps.svg"), "w").write("\n".join(out))
