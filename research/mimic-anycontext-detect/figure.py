"""Writes experiments/figure.svg from results.json: universal vs per-family vs adapted AUROC by family."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(H, "results.json")))["regimes"]
series = [("universal", "universal (family unseen)", "#c0392b"), ("adapted_k40", "universal + 40 target items", "#e08e0b"), ("per_family", "per-family (in-family)", "#1f6fb2")]
fams = list(r); W, Ht, L, B, T = 760, 340, 60, 60, 30
y = lambda v: T + (Ht - T - B) * (1 - (v - 0.8) / 0.2)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {Ht}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>', f'<text x="{L}" y="18" font-weight="bold">n-gram detector AUROC by family (5 seeds; 1.0 = perfect)</text>']
for v in (0.8, 0.85, 0.9, 0.95, 1.0):
    o.append(f'<line x1="{L}" x2="{W-10}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#ddd"/><text x="{L-6}" y="{y(v)+4:.1f}" text-anchor="end">{v:.2f}</text>')
gw = (W - L - 10) / len(fams)
for i, f in enumerate(fams):
    x0 = L + i * gw + gw * 0.12
    for j, (k, _, c) in enumerate(series):
        v = max(r[f][k][0], 0.8); bw = gw * 0.25
        o.append(f'<rect x="{x0+j*bw:.1f}" y="{y(v):.1f}" width="{bw-2:.1f}" height="{y(0.8)-y(v):.1f}" fill="{c}"/>')
    o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{Ht-B+16}" text-anchor="middle">{f}</text>')
for j, (_, lab, c) in enumerate(series):
    o.append(f'<rect x="{L+j*230}" y="{Ht-22}" width="12" height="12" fill="{c}"/><text x="{L+j*230+17}" y="{Ht-12}">{lab}</text>')
o.append('</svg>')
os.makedirs(os.path.join(H, "experiments"), exist_ok=True)
open(os.path.join(H, "experiments", "figure.svg"), "w").write("\n".join(o))
