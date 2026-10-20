"""Line plot of CPU saved vs formal cap and kills kept, parsed from results.txt (stdlib only)."""
import os, re
d = os.path.dirname(__file__)
pts = []
for l in open(os.path.join(d, "results.txt")):
    m = re.match(r"\s*16\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+[\d.]+\s+(\d+)%", l)
    if m:
        pts.append((int(m.group(1)), int(m.group(2)), float(m.group(3)), float(m.group(4)), int(m.group(5))))
pts.sort()
W, H, L, B, T = 560, 340, 60, 50, 40
xs = lambda cap: L + (W - L - 30) * cap / 300
ys = lambda v: H - B - (H - B - T) * v / 100
s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     '<text x="10" y="20" font-weight="bold">Formal time cap: CPU saved and kills kept (N=16, eda-verify log)</text>']
for v in (0, 25, 50, 75, 100):
    s.append(f'<line x1="{L}" x2="{W-30}" y1="{ys(v)}" y2="{ys(v)}" stroke="#ddd"/><text x="{L-6}" y="{ys(v)+4}" text-anchor="end">{v}%</text>')
for c in (0, 100, 200, 300):
    s.append(f'<text x="{xs(c)}" y="{H-B+18}" text-anchor="middle">{c}</text>')
s.append(f'<text x="{(L+W)/2}" y="{H-8}" text-anchor="middle">formal cap T (CPU seconds per mutant)</text>')
saved = " ".join(f"{xs(c):.1f},{ys(sv):.1f}" for c, _, _, _, sv in pts)
kept = " ".join(f"{xs(c):.1f},{ys(100*k/66):.1f}" for c, _, k, _, _ in pts)
s.append(f'<polyline points="{saved}" fill="none" stroke="#2a6fb0" stroke-width="2"/><polyline points="{kept}" fill="none" stroke="#c0392b" stroke-width="2"/>')
s.append(f'<text x="{L+10}" y="{T+4}" fill="#2a6fb0">blue: CPU saved vs uncapped</text><text x="{L+10}" y="{T+20}" fill="#c0392b">red: killable mutants found (% of 66)</text>')
s.append('</svg>')
open(os.path.join(d, "figure.svg"), "w").write("\n".join(s))
print(len(pts), "points")
