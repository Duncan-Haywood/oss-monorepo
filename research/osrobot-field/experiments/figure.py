"""Plot kill fraction against time for sweeps 1 and 2 of results.txt (inline planner), stdlib only."""
import os
here = os.path.dirname(__file__)
lines = open(os.path.join(here, "results.txt")).read().splitlines()

def block(title):
    i = next(k for k, l in enumerate(lines) if l.startswith(title)) + 2
    rows = []
    while i < len(lines) and lines[i].strip():
        t = lines[i].split()
        rows.append((t[0] + " " + t[1], float(t[2]), float(t[3]))); i += 1
    return rows

s1 = [r for r in block("# Sweep 1") if r[0].startswith("inline")]
s2 = [r for r in block("# Sweep 2") if r[0].startswith("inline")]
W, H, x0, y0, w, h = 560, 360, 60, 30, 470, 270
tmax = 190.0
px = lambda t: x0 + w * t / tmax; py = lambda k: y0 + h * (1 - k)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>']
for k in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
    out.append(f'<text x="{x0-8}" y="{py(k)+4}" text-anchor="end">{k:g}</text>')
for t in range(0, 200, 50):
    out.append(f'<text x="{px(t)}" y="{y0+h+16}" text-anchor="middle">{t}</text>')
for rows, col, name in ((s1, "#1b6ca8", "speed 0.25 to 3 m/s, no overlap"), (s2, "#c0392b", "overlap 0 to 0.75, 1 m/s")):
    pts = [(px(t), py(k)) for _, k, t in rows]
    out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
    out += [f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3" fill="{col}"/>' for a, b in pts]
    for (lab, _, _), (a, b) in zip(rows, pts):
        out.append(f'<text x="{a+5:.1f}" y="{b-6:.1f}" font-size="10" fill="{col}">{lab.split()[1]}</text>')
out.append(f'<text x="{x0+w/2}" y="{H-30}" text-anchor="middle">time to weed the 60 x 30 m field (min)</text>')
out.append(f'<text x="14" y="{y0+h/2}" transform="rotate(-90 14 {y0+h/2})" text-anchor="middle">share of weeds killed</text>')
for i, (col, name) in enumerate((("#1b6ca8", "speed (m/s), no overlap"), ("#c0392b", "lane overlap, 1 m/s"))):
    out.append(f'<rect x="{x0+i*220}" y="{H-14}" width="14" height="4" fill="{col}"/><text x="{x0+i*220+20}" y="{H-8}">{name}</text>')
out.append('</svg>')
open(os.path.join(here, "kill_vs_time.svg"), "w").write("\n".join(out))
