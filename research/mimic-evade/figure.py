"""Draw experiments/figure.svg: held-out AUROC of the n-gram detector when machine text is edited. No plotting library."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))
names = list(r["edits"])
W, H, L, B, T, R = 760, 380, 60, 120, 40, 20
lo_, hi_ = 0.8, 1.0
y = lambda a: H - B - (a - lo_) / (hi_ - lo_) * (H - B - T)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">Held-out AUROC after editing machine text (blue: fixed detector, orange: refit)</text>']
for a in (0.8, 0.85, 0.9, 0.95, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{y(a):.1f}" y2="{y(a):.1f}" stroke="#ddd"/><text x="{L-8}" y="{y(a)+4:.1f}" text-anchor="end">{a:.2f}</text>')
b = r["baseline"]["auroc"]
s.append(f'<line x1="{L}" x2="{W-R}" y1="{y(b):.1f}" y2="{y(b):.1f}" stroke="black" stroke-dasharray="4"/>')
gw = (W - L - R) / len(names)
for i, n in enumerate(names):
    e = r["edits"][n]
    x0 = L + i * gw + gw * 0.1
    for j, (k, c) in enumerate((("auroc_machine_edited", "#1b6ca8"), ("auroc_adaptive_detector", "#e08a1e"))):
        a = e[k]; x = x0 + j * gw * 0.4
        s.append(f'<rect x="{x:.1f}" y="{y(a):.1f}" width="{gw*0.36:.1f}" height="{H-B-y(a):.1f}" fill="{c}"/>')
        s.append(f'<text x="{x+gw*0.18:.1f}" y="{y(a)-4:.1f}" text-anchor="middle" font-size="9">{a:.3f}</text>')
    s.append(f'<text transform="translate({x0+gw*0.3:.1f},{H-B+14}) rotate(30)" font-size="11">{n}</text>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
