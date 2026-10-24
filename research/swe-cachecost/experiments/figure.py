"""Scatter (SVG, stdlib only): cache-read tokens per API request against requests in the run, with the linear context fit."""
import glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_cachecost.cc import usable, totals, cost_shares, fit

root = os.path.join(HERE, "..", "..", "..", "prompts")
prices = json.load(open(os.path.join(root, "pricing.json")))["models"]
u = []
for f in sorted(glob.glob(os.path.join(root, "runs", "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and usable(r) and cost_shares(r, prices):
        u.append(r)
xs = [totals(r)["requests"] for r in u]
ys = [totals(r)["cache_read"] / totals(r)["requests"] / 1000 for r in u]
a, b, r2 = fit(xs, ys)
W, H, L, B, T = 560, 380, 60, 50, 30
x1, y1 = 160, 260
px = lambda x: L + x / x1 * (W - L - 12)
py = lambda y: H - B - y / y1 * (H - B - T)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Cache-read tokens per request against requests per run">',
     '<style>text{font:12px sans-serif;fill:#222}</style><rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="18">Context re-read per request (thousand tokens), {len(u)} runs; line: {a:.0f}k + {b:.2f}k x requests</text>']
for v in range(0, 161, 40):
    o.append(f'<text x="{px(v) - 8:.0f}" y="{H - B + 16}">{v}</text><line x1="{px(v):.0f}" x2="{px(v):.0f}" y1="{T}" y2="{H - B}" stroke="#eee"/>')
for v in range(0, 261, 50):
    o.append(f'<text x="14" y="{py(v) + 4:.0f}">{v}k</text><line x1="{L}" x2="{W - 12}" y1="{py(v):.0f}" y2="{py(v):.0f}" stroke="#eee"/>')
for x, y in zip(xs, ys):
    o.append(f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="2.2" fill="#2a6fb0" fill-opacity=".4"/>')
o.append(f'<line x1="{px(0):.0f}" y1="{py(a):.0f}" x2="{px(x1):.0f}" y2="{py(a + b * x1):.0f}" stroke="#c0392b" stroke-width="1.5"/>')
o.append(f'<text x="{L + 190}" y="{H - 12}">API requests in the run</text></svg>')
open(os.path.join(HERE, "context_per_request.svg"), "w").write("\n".join(o))
