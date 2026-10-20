"""Draw experiments/figure.svg: MAUVE against detector AUROC, one point per family x model cell. No plotting library."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, "results.json")))["cells"]
W, H, L, B, T, R = 560, 400, 60, 55, 40, 20
x = lambda a: L + (a - 0.8) / 0.2 * (W - L - R)
y = lambda v: H - B - v * (H - B - T)
col = {"llama-chat": "#1b6ca8", "mistral-chat": "#c0502a", "mpt-chat": "#4a8f3c"}
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">MAUVE (low = far from human) against n-gram detector AUROC</text>']
for v in (0, 0.25, 0.5, 0.75, 1.0):
    s.append(f'<line x1="{L}" x2="{W-R}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#ddd"/><text x="{L-8}" y="{y(v)+4:.1f}" text-anchor="end">{v:.2f}</text>')
for a in (0.8, 0.85, 0.9, 0.95, 1.0):
    s.append(f'<text x="{x(a):.1f}" y="{H-B+16}" text-anchor="middle">{a:.2f}</text>')
s.append(f'<text x="{(L+W-R)/2:.0f}" y="{H-B+34}" text-anchor="middle">detector AUROC (2-fold cross-fit, same texts)</text>')
for k, c in r.items():
    g = k.split("/")[1]
    s.append(f'<circle cx="{x(c["auroc"]):.1f}" cy="{y(c["mauve"]):.1f}" r="5" fill="{col[g]}" fill-opacity="0.8"><title>{k}</title></circle>')
for k in ("wiki/mistral-chat", "books/llama-chat", "recipes/llama-chat", "news/llama-chat"):
    c = r[k]
    s.append(f'<text x="{x(c["auroc"])+7:.1f}" y="{y(c["mauve"])+4:.1f}" font-size="10">{k.split("/")[0]}</text>')
for i, (g, c) in enumerate(col.items()):
    s.append(f'<circle cx="{L+10+i*120}" cy="{H-8}" r="5" fill="{c}"/><text x="{L+20+i*120}" y="{H-4}">{g}</text>')
s.append("</svg>")
open(os.path.join(HERE, "experiments", "figure.svg"), "w").write("\n".join(s))
