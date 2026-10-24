"""Bar chart of sweep 1 (minutes to finish, by plan), parsed from results.txt. Stdlib only."""
import os
here = os.path.dirname(os.path.abspath(__file__))
lines = open(os.path.join(here, "results.txt")).read().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("# Sweep 1")) + 2
rows = []
while i < len(lines) and lines[i].strip():
    t = lines[i].split(); rows.append((" ".join(t[:-4]), float(t[-3]))); i += 1
rows = [r for r in rows if "random" not in r[0]]  # random tour (122 min) would flatten the rest
W, H, x0, y0, w, h = 560, 300, 60, 40, 470, 200
top = 80.0
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12" role="img" aria-label="Minutes to cover a 60 by 30 m field: inline 51.7, scout with nearest-neighbour tour 57.0, with 2-opt 56.1, with lane-order sweep 69.8">',
       '<rect width="100%" height="100%" fill="white"/>',
       f'<text x="{W/2}" y="20" text-anchor="middle" font-size="14">Minutes to finish one field (mean of 30; random-tour scout, 122 min, omitted)</text>',
       f'<line x1="{x0}" y1="{y0+h}" x2="{x0+w}" y2="{y0+h}" stroke="#999"/>']
bw = w / len(rows)
for k, (lab, v) in enumerate(rows):
    bh = h * v / top; x = x0 + k * bw + bw * 0.15
    out.append(f'<rect x="{x:.1f}" y="{y0+h-bh:.1f}" width="{bw*0.7:.1f}" height="{bh:.1f}" fill="{"#1b6ca8" if lab.startswith("inline") else "#c0392b"}"/>')
    out.append(f'<text x="{x+bw*0.35:.1f}" y="{y0+h-bh-5:.1f}" text-anchor="middle">{v:.1f}</text>')
    out.append(f'<text x="{x+bw*0.35:.1f}" y="{y0+h+16}" text-anchor="middle" font-size="11">{lab.replace("scout tour=", "scout, ")}</text>')
out.append('</svg>')
open(os.path.join(here, "minutes.svg"), "w").write("\n".join(out))
