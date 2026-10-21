"""Writes experiments/figure.svg from results.json: plain-prompt AUROC by family for each model size."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(H, "results.json")))
cols = ["#7f8c8d", "#1f6fb2", "#c0392b"]
models = list(R)
fams = R[models[0]]["families"]; W, Ht, L, B, T = 760, 340, 60, 60, 30
y = lambda v: T + (Ht - T - B) * (1 - v / 0.6)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {Ht}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="18" font-weight="bold">Plain-prompt detector AUROC by Qwen2.5 size (0.5 = chance)</text>']
for v in (0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
    o.append(f'<line x1="{L}" x2="{W-10}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{"#c0392b" if v == 0.5 else "#ddd"}"/><text x="{L-6}" y="{y(v)+4:.1f}" text-anchor="end">{v:.1f}</text>')
gw = (W - L - 10) / len(fams)
for i, f in enumerate(fams):
    x0 = L + i * gw + gw * 0.1
    for j, m in enumerate(models):
        v = R[m]["plain_by_family"][f]; bw = gw * 0.8 / len(models)
        o.append(f'<rect x="{x0+j*bw:.1f}" y="{y(v):.1f}" width="{bw-2:.1f}" height="{y(0)-y(v):.1f}" fill="{cols[j]}"/>')
    o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{Ht-B+16}" text-anchor="middle">{f}</text>')
for j, m in enumerate(models):
    o.append(f'<rect x="{L+j*200}" y="{Ht-22}" width="12" height="12" fill="{cols[j]}"/><text x="{L+j*200+17}" y="{Ht-12}">{m.split("/")[1]}</text>')
o.append('</svg>')
os.makedirs(os.path.join(H, "experiments"), exist_ok=True)
open(os.path.join(H, "experiments", "figure.svg"), "w").write("\n".join(o))
