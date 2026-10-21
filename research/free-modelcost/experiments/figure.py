"""Forest plot (SVG, stdlib only) of matched Opus/Sonnet ratios, from results.json."""
import json, math, os
H = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(H, "results.json")))["matched"]
W, HT, L, T = 620, 40 + 34 * len(rows), 170, 40
x0, x1 = math.log(.8), math.log(11)
px = lambda v: L + (math.log(v) - x0) / (x1 - x0) * (W - L - 20)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {HT}" role="img" aria-label="Opus over Sonnet ratios, matched on date and track">',
     '<style>text{font:12px sans-serif;fill:#222}</style><rect width="100%" height="100%" fill="#fff"/>',
     '<text x="10" y="20">Opus / Sonnet ratio of medians, matched on date x track (95% CI), log axis</text>']
for v in (1, 2, 4, 8):
    o.append(f'<line x1="{px(v):.0f}" x2="{px(v):.0f}" y1="{T - 8}" y2="{HT - 22}" stroke="{"#888" if v == 1 else "#ddd"}"/><text x="{px(v) - 4:.0f}" y="{HT - 6}">{v}x</text>')
for i, r in enumerate(rows):
    y = T + 34 * i + 10
    o.append(f'<text x="10" y="{y + 4}">{r["metric"].replace("_", " ")}</text>'
             f'<line x1="{px(r["lo"]):.0f}" x2="{px(r["hi"]):.0f}" y1="{y}" y2="{y}" stroke="#1b6ca8" stroke-width="2"/>'
             f'<circle cx="{px(r["ratio"]):.0f}" cy="{y}" r="4.5" fill="#1b6ca8"/>'
             f'<text x="{px(r["hi"]) + 6:.0f}" y="{y + 4}">{r["ratio"]:.2f}</text>')
o.append("</svg>")
open(os.path.join(H, "ratios.svg"), "w").write("\n".join(o) + "\n")
