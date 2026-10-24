"""Kill share against total minutes: one platform (sweep 6) and two (sweep 2, 3 m swath; sweep 8, 1 m swath). Parsed from results.txt. Stdlib only."""
import os
here = os.path.dirname(os.path.abspath(__file__))
lines = open(os.path.join(here, "results.txt")).read().splitlines()


def block(head, prefix):
    i = next(k for k, l in enumerate(lines) if l.startswith(head)) + 2
    pts = []
    while i < len(lines) and lines[i].strip():
        if lines[i].startswith(prefix):
            t = lines[i].split(); pts.append((float(t[-4]), float(t[-6]), " ".join(t[:-6])))
        i += 1
    return pts


series = [("one robot, inline (speed 0.5 to 3 m/s)", block("# Sweep 6", "inline"), "#1b6ca8"),
          ("scout + treater, 3 m swath (scout 1 to 12 m/s)", block("# Sweep 2", "pair"), "#c0392b"),
          ("scout + treater, 1 m swath (scout 0.5 to 2 m/s)", block("# Sweep 8", "pair"), "#2e8b57")]
W, H, x0, y0, w, h = 600, 340, 60, 40, 520, 230
xmax, ymax = 95.0, 0.6
X = lambda v: x0 + w * v / xmax
Y = lambda v: y0 + h - h * v / ymax
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12" role="img" aria-label="Share of weeds killed against total minutes for one inline robot and for a scout plus a ground treater">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<text x="{W/2}" y="20" text-anchor="middle" font-size="14">Weeds killed against total minutes (mean of 30 fields)</text>',
       f'<line x1="{x0}" y1="{y0+h}" x2="{x0+w}" y2="{y0+h}" stroke="#999"/><line x1="{x0}" y1="{y0}" x2="{x0}" y2="{y0+h}" stroke="#999"/>']
for t in range(0, 100, 20):
    out.append(f'<text x="{X(t):.0f}" y="{y0+h+16}" text-anchor="middle">{t}</text>')
for k in range(0, 7, 2):
    out.append(f'<text x="{x0-6}" y="{Y(k/10)+4:.0f}" text-anchor="end">{k/10:.1f}</text>')
out.append(f'<text x="{x0+w/2}" y="{y0+h+34}" text-anchor="middle">total minutes (scout flight + ground robot, no overlap)</text>')
for n, (lab, pts, col) in enumerate(series):
    path = " ".join(f"{X(a):.1f},{Y(b):.1f}" for a, b, _ in pts)
    out.append(f'<polyline points="{path}" fill="none" stroke="{col}" stroke-width="2"/>')
    out += [f'<circle cx="{X(a):.1f}" cy="{Y(b):.1f}" r="3.5" fill="{col}"/>' for a, b, _ in pts]
    out.append(f'<text x="{x0+w-6}" y="{y0+16+16*n}" text-anchor="end" fill="{col}">{lab}</text>')
out.append('</svg>')
open(os.path.join(here, "frontier.svg"), "w").write("\n".join(out))
