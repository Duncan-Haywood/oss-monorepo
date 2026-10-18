"""Writes experiments/figure.svg from results.json: held-out AUROC of the plain, universal and per-family prompts by family."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(H, "results.json")))["per_family"]
series = [("plain", "plain prompt", "#7f8c8d"), ("universal_heldout", "universal (family held out)", "#c0392b"), ("per_family", "per-family pick", "#1f6fb2")]
fams = sorted(r); W, Ht, L, B, T = 760, 340, 60, 60, 30
y = lambda v: T + (Ht - T - B) * (1 - v / 0.6)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {Ht}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="18" font-weight="bold">Prompted 0.5B detector AUROC, human above LLM (0.5 = chance)</text>']
for v in (0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
    o.append(f'<line x1="{L}" x2="{W-10}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{"#c0392b" if v == 0.5 else "#ddd"}"/><text x="{L-6}" y="{y(v)+4:.1f}" text-anchor="end">{v:.1f}</text>')
gw = (W - L - 10) / len(fams)
for i, f in enumerate(fams):
    x0 = L + i * gw + gw * 0.12
    for j, (k, _, c) in enumerate(series):
        v = r[f][k]; bw = gw * 0.25
        o.append(f'<rect x="{x0+j*bw:.1f}" y="{y(v):.1f}" width="{bw-2:.1f}" height="{y(0)-y(v):.1f}" fill="{c}"/>')
    o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{Ht-B+16}" text-anchor="middle">{f}</text>')
for j, (_, lab, c) in enumerate(series):
    o.append(f'<rect x="{L+j*230}" y="{Ht-22}" width="12" height="12" fill="{c}"/><text x="{L+j*230+17}" y="{Ht-12}">{lab}</text>')
o.append('</svg>')
os.makedirs(os.path.join(H, "experiments"), exist_ok=True)
open(os.path.join(H, "experiments", "figure.svg"), "w").write("\n".join(o))
