"""Draw experiments/figure.svg (AUROC against prefix length) from results.json. No plotting library."""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))["prefix"]
ns = sorted(int(n) for n in r)
W, H, L, B, T, R = 560, 340, 60, 50, 40, 20
x = lambda n: L + (math.log(n) - math.log(ns[0])) / (math.log(ns[-1]) - math.log(ns[0])) * (W - L - R)
y = lambda a: H - B - (a - 0.5) / 0.5 * (H - B - T)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">N-gram detector, held-out families: AUROC by text length</text>']
for a in (0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{y(a):.1f}" y2="{y(a):.1f}" stroke="#ddd"/><text x="{L-8}" y="{y(a)+4:.1f}" text-anchor="end">{a:.1f}</text>')
for n in ns:
    s.append(f'<text x="{x(n):.1f}" y="{H-B+18}" text-anchor="middle">{n}</text>')
s.append(f'<text x="{(L+W-R)/2}" y="{H-8}" text-anchor="middle">characters kept (log scale)</text>')
for key, col, lab in (("matched", "#1b6ca8", "fit and scored on the prefix"), ("clean_fit", "#c0502a", "fit on full text, scored on prefix")):
    pts = " ".join(f"{x(n):.1f},{y(r[str(n)][key]['auroc']):.1f}" for n in ns)
    s.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2"/>')
    for n in ns:
        lo, hi = r[str(n)][key]["ci95"]
        s.append(f'<line x1="{x(n):.1f}" x2="{x(n):.1f}" y1="{y(lo):.1f}" y2="{y(hi):.1f}" stroke="{col}"/><circle cx="{x(n):.1f}" cy="{y(r[str(n)][key]["auroc"]):.1f}" r="3" fill="{col}"/>')
    ly = 56 if key == "matched" else 74
    s.append(f'<line x1="{W-250}" x2="{W-226}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/><text x="{W-220}" y="{ly+4}">{lab}</text>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
