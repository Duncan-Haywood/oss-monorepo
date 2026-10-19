"""Draw experiments/figure.svg: held-out AUROC against queries per text. No plotting library."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
W, H, L, B, T, R = 720, 380, 60, 60, 50, 20
qs = sorted({x["q"] for x in r["rows"]})
X = lambda i: L + i * (W - L - R) / (len(qs) - 1)
Y = lambda a: H - B - a * (H - B - T)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">Held-out AUROC vs detector queries per text (black-box attack)</text>',
     f'<text x="{L}" y="40" font-size="11">solid: delete k=20 types, dashed: k=10; dotted lines: white-box ceiling (reads weights)</text>']
for a in (0, 0.25, 0.5, 0.75, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(a):.1f}" y2="{Y(a):.1f}" stroke="{"#888" if a == 0.5 else "#ddd"}"/><text x="{L-8}" y="{Y(a)+4:.1f}" text-anchor="end">{a:.2f}</text>')
for i, q in enumerate(qs):
    s.append(f'<text x="{X(i):.1f}" y="{H-B+18}" text-anchor="middle">{q}</text>')
s.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle">queries per machine text (Q)</text>')
for k, c, dash in ((20, "#1b6ca8", ""), (10, "#e08a1e", ' stroke-dasharray="5"')):
    pts = " ".join(f"{X(i):.1f},{Y(x['auroc']):.1f}" for i, x in enumerate(sorted((x for x in r["rows"] if x["k"] == k), key=lambda x: x["q"])))
    s.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"{dash}/>')
    y = Y(r["whitebox"][str(k)])
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="{c}" stroke-dasharray="2 3"/>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
