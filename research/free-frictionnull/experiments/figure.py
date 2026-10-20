"""Draw null-vs-observed.svg from results.txt (stdlib only): observed repeats per day against the 95% null interval."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
rows = []
for l in open(os.path.join(HERE, "results.txt")):
    m = re.match(r"(2026-\d\d-\d\d)\s+(\d+)/(\d+)\s+(\d+)\s+\[(\d+), (\d+)\]", l)
    if m:
        rows.append((m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(5)), int(m.group(6))))
W, H, L, T = 640, 300, 60, 30
mx = max(max(r[2], r[4]) for r in rows)
sx = (W - L - 20) / len(rows)
y = lambda v: H - 40 - v * (H - 40 - T) / mx
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="18" font-weight="bold">Entries repeating an earlier-day complaint: observed (dot) vs 95% permutation null (bar)</text>',
     f'<line x1="{L}" y1="{y(0)}" x2="{W-10}" y2="{y(0)}" stroke="#444"/>']
for i, (d, k, n, lo, hi) in enumerate(rows):
    cx = L + sx * (i + .5)
    o.append(f'<line x1="{cx}" y1="{y(lo)}" x2="{cx}" y2="{y(hi)}" stroke="#888" stroke-width="14"/>')
    o.append(f'<circle cx="{cx}" cy="{y(k)}" r="6" fill="#c0392b"/>')
    o.append(f'<text x="{cx}" y="{H-22}" text-anchor="middle">{d[5:]}</text>')
    o.append(f'<text x="{cx+12}" y="{y(k)+4}">{k}/{n}</text>')
o.append('</svg>')
open(os.path.join(HERE, "null-vs-observed.svg"), "w").write("\n".join(o))
