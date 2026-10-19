"""Draw experiments/figure.svg: held-out AUROC against edit budget k. No plotting library."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
W, H, L, B, T, R = 720, 380, 60, 60, 50, 20
ks = [x["k"] for x in r["modes"]["delete"]]
X = lambda i: L + i * (W - L - R) / (len(ks) - 1)
Y = lambda a: H - B - a * (H - B - T)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">Held-out AUROC vs words edited per machine text (white-box attack)</text>',
     f'<text x="{L}" y="40" font-size="11">solid: fixed detector, dashed: refit on attacked training text; blue: delete, orange: swap</text>']
for a in (0, 0.25, 0.5, 0.75, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(a):.1f}" y2="{Y(a):.1f}" stroke="{"#888" if a == 0.5 else "#ddd"}"/><text x="{L-8}" y="{Y(a)+4:.1f}" text-anchor="end">{a:.2f}</text>')
for i, k in enumerate(ks):
    s.append(f'<text x="{X(i):.1f}" y="{H-B+18}" text-anchor="middle">{k}</text>')
s.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle">word types edited per text (k)</text>')
for mode, c in (("delete", "#1b6ca8"), ("swap", "#e08a1e")):
    for key, dash in (("auroc_fixed", ""), ("auroc_adaptive", ' stroke-dasharray="5"')):
        pts = " ".join(f"{X(i):.1f},{Y(x[key]):.1f}" for i, x in enumerate(r["modes"][mode]))
        s.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"{dash}/>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
