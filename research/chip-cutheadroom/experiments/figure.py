"""Bar chart from results.json: gates after the fast flow vs the default flow, and what exact 4-cut rewriting could still remove."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, "results.json")))
by = {(r["design"], r["flow"]): r for r in rows}
designs = list(dict.fromkeys(r["design"] for r in rows))
W, H, L, B, T = 720, 340, 60, 50, 40
mx = max(r["gates"] for r in rows)
bw = (W - L - 20) / len(designs)
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
       '<rect width="100%" height="100%" fill="#fff"/>',
       f'<text x="{L}" y="22" font-size="14" font-weight="bold">Gates by flow, and what exact 4-input rewriting could still remove</text>']
for i, d in enumerate(designs):
    x0 = L + i * bw
    for j, (flow, col) in enumerate((("fast", "#9aa5b1"), ("default", "#1f77b4"))):
        g = by[(d, flow)]["gates"]
        h = (H - B - T) * g / mx
        x = x0 + 8 + j * (bw - 16) / 2
        out.append(f'<rect x="{x:.1f}" y="{H - B - h:.1f}" width="{(bw - 16) / 2 - 2:.1f}" height="{h:.1f}" fill="{col}"/>')
        out.append(f'<text x="{x + 4:.1f}" y="{H - B - h - 4:.1f}">{g}</text>')
        rm = by[(d, flow)]["removable_disjoint"]
        if rm:
            out.append(f'<text x="{x + 4:.1f}" y="{H - B - h - 16:.1f}" fill="#d62728">-{rm}</text>')
    out.append(f'<text x="{x0 + bw / 2:.1f}" y="{H - B + 18}" text-anchor="middle">{d}</text>')
out.append(f'<line x1="{L}" y1="{H - B}" x2="{W - 10}" y2="{H - B}" stroke="#333"/>')
out.append('<rect x="440" y="34" width="10" height="10" fill="#9aa5b1"/><text x="455" y="43">fast (strash; map)</text>')
out.append('<rect x="440" y="50" width="10" height="10" fill="#1f77b4"/><text x="455" y="59">Yosys default script</text>')
out.append(f'<text x="{L}" y="{H - 12}" fill="#d62728">red: gates an exact 4-cut rewrite could remove (zero except mul6/lt16 under resyn2)</text>')
out.append("</svg>")
open(os.path.join(HERE, "headroom.svg"), "w").write("\n".join(out))
