"""Draw experiments/figure.svg (held-out AUROC per detector, with 95% bootstrap intervals). No plotting library."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))["detectors"]
names = list(r)
W, H, L, B, T, R = 700, 360, 60, 110, 40, 20
lo_, hi_ = 0.7, 1.0
y = lambda a: H - B - (a - lo_) / (hi_ - lo_) * (H - B - T)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">Held-out-family AUROC: single detectors and stacks</text>']
for a in (0.7, 0.8, 0.9, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{y(a):.1f}" y2="{y(a):.1f}" stroke="#ddd"/><text x="{L-8}" y="{y(a)+4:.1f}" text-anchor="end">{a:.1f}</text>')
gw = (W - L - R) / len(names)
for i, n in enumerate(names):
    a, (lo, hi) = r[n]["auroc"], r[n]["ci95"]
    x0 = L + i * gw + gw * 0.2
    s.append(f'<rect x="{x0:.1f}" y="{y(a):.1f}" width="{gw*0.6:.1f}" height="{H-B-y(a):.1f}" fill="#1b6ca8"/>')
    xm = x0 + gw * 0.3
    s.append(f'<line x1="{xm:.1f}" x2="{xm:.1f}" y1="{y(lo):.1f}" y2="{y(hi):.1f}" stroke="black"/>')
    s.append(f'<text x="{xm:.1f}" y="{y(hi)-4:.1f}" text-anchor="middle" font-size="10">{a:.3f}</text>')
    s.append(f'<text transform="translate({xm:.1f},{H-B+14}) rotate(30)" font-size="11">{n}</text>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
