"""Draw experiments/figure.svg (in-distribution vs left-out AUROC per generator and decoding). No plotting library."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
groups = [(f"{v} (model)", r["generator"][v]) for v in r["generator"]] + [(f"{v} (decoding)", r["decoding"][v]) for v in r["decoding"]]
W, H, L, B, T, R = 640, 340, 60, 70, 40, 20
y = lambda a: H - B - (a - 0.85) / 0.15 * (H - B - T)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">N-gram detector: AUROC on a generator it was / was not fit on</text>']
for a in (0.85, 0.9, 0.95, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{y(a):.1f}" y2="{y(a):.1f}" stroke="#ddd"/><text x="{L-8}" y="{y(a)+4:.1f}" text-anchor="end">{a:.2f}</text>')
gw = (W - L - R) / len(groups)
for i, (name, d) in enumerate(groups):
    for j, (key, col) in enumerate((("in", "#1b6ca8"), ("out", "#c0502a"))):
        x0 = L + i * gw + gw * (0.15 + 0.35 * j)
        a, (lo, hi) = d[key]["auroc"], d[key]["ci95"]
        s.append(f'<rect x="{x0:.1f}" y="{y(a):.1f}" width="{gw*0.3:.1f}" height="{H-B-y(a):.1f}" fill="{col}"/>')
        xm = x0 + gw * 0.15
        s.append(f'<line x1="{xm:.1f}" x2="{xm:.1f}" y1="{y(lo):.1f}" y2="{y(hi):.1f}" stroke="black"/>')
        s.append(f'<text x="{xm:.1f}" y="{y(hi)-4:.1f}" text-anchor="middle" font-size="10">{a:.3f}</text>')
    s.append(f'<text x="{L+i*gw+gw/2:.1f}" y="{H-B+16}" text-anchor="middle" font-size="11">{name}</text>')
for k, (col, lab) in enumerate((("#1b6ca8", "fit on all generators (other half of items)"), ("#c0502a", "this generator or decoding left out of the fit"))):
    s.append(f'<rect x="{L}" y="{H-30+k*14-9}" width="10" height="10" fill="{col}"/><text x="{L+16}" y="{H-30+k*14}">{lab}</text>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
