"""Draws experiments/err_vs_depth.svg from the committed results.txt (section B). Stdlib only."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows, on = {}, False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("B."):
        on = True
        continue
    if on and not l.strip():
        break
    p = l.split()
    if on and len(p) == 6 and p[1][0].isdigit():
        rows.setdefault(p[0], []).append((float(p[1]), float(p[3])))
W, H, L, R, T, B = 560, 320, 60, 20, 40, 50
ymax = max(y for v in rows.values() for _, y in v) * 1.05
X = lambda z: L + (W - L - R) * (3.5 - min(z, 3.5)) / 3.5 if z <= 3.5 else None
cols = {"wire": "#c0392b", "plastic": "#1f6fb2", "wood-shaped": "#2e8b57"}
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Whole-sheet shape error against arm half-depth for three stock hangers">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Whole-sheet shape error vs hanger arm depth (size M tee)</text>']
for t in range(0, int(ymax) + 1, 2):
    y = H - B - (H - B - T) * t / ymax
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{y}" y2="{y}" stroke="#ddd"/><text x="{L-6}" y="{y+4}" text-anchor="end" font-family="sans-serif" font-size="11">{t}</text>')
for z in (3, 2, 1, 0):
    x = X(z)
    o.append(f'<text x="{x}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{z}</text>')
o.append(f'<text x="{W/2}" y="{H-8}" text-anchor="middle" font-family="sans-serif" font-size="12">arm half-depth (cm); left = deeper arm, 0 = a rod</text>')
o.append(f'<text x="14" y="{H/2}" transform="rotate(-90 14 {H/2})" text-anchor="middle" font-family="sans-serif" font-size="12">error (cm RMS)</text>')
for i, (n, v) in enumerate(rows.items()):
    pts = [(X(z), H - B - (H - B - T) * y / ymax) for z, y in sorted(v) if z <= 3.5]
    o.append(f'<polyline fill="none" stroke="{cols[n]}" stroke-width="2" points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
    for a, b in pts:
        o.append(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3" fill="{cols[n]}"/>')
    o.append(f'<text x="{L+10}" y="{T+16+16*i}" fill="{cols[n]}" font-family="sans-serif" font-size="12">{n}</text>')
o.append("</svg>")
(HERE / "err_vs_depth.svg").write_text("\n".join(o) + "\n")
