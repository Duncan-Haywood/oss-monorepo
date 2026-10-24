"""Bar chart (SVG, stdlib): cells ratio shared/unshared per case, one bar per ABC script."""
import os
HERE = os.path.dirname(__file__)
rows = [l.split() for l in open(os.path.join(HERE, "results.txt")) if len(l.split()) == 9 and l.split()[0] != "family"]
cases = list(dict.fromkeys((r[0], r[1], r[2]) for r in rows))
scripts = list(dict.fromkeys(r[3] for r in rows))
cols = ["#1b6ca8", "#d1495b", "#2e933c", "#edae49", "#6a4c93"]
W, H, L, B = 900, 360, 50, 70
bw = 6; gw = len(scripts) * bw + 8
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="11">',
       '<rect width="100%" height="100%" fill="white"/>']
y = lambda v: H - B - (v - 0.5) / 0.6 * (H - B - 30)
for v in (0.6, 0.8, 1.0, 1.1):
    svg.append(f'<line x1="{L}" x2="{W-10}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#ccc"/><text x="{L-6}" y="{y(v)+4:.1f}" text-anchor="end">{v}</text>')
for i, c in enumerate(cases):
    x0 = L + 8 + i * gw * 1.15
    for j, s in enumerate(scripts):
        r = next(r for r in rows if tuple(r[:3]) == c and r[3] == s)
        v = int(r[4]) / int(r[6])
        svg.append(f'<rect x="{x0 + j*bw:.1f}" y="{y(v):.1f}" width="{bw-1}" height="{y(0.5)-y(v):.1f}" fill="{cols[j]}"/>')
    svg.append(f'<text transform="translate({x0+gw/2:.1f},{H-B+10}) rotate(60)" font-size="10">{c[0]} w{c[1]} k{c[2]}</text>')
svg.append(f'<text x="{L}" y="16" font-size="13">Cells, shared / unshared common term (below 1: sharing is smaller)</text>')
for j, s in enumerate(scripts):
    svg.append(f'<rect x="{500+j*80}" y="6" width="8" height="8" fill="{cols[j]}"/><text x="{512+j*80}" y="14" font-size="9">{s[:9]}</text>')
svg.append('</svg>')
open(os.path.join(HERE, "sharesign.svg"), "w").write("\n".join(svg))
