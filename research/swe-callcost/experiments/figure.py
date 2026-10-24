"""Scatter (SVG, stdlib only) of cost against tool calls on log axes, with the pooled fit. Reads prompts/runs directly."""
import glob, json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_callcost.cc import usable, loglog, fit

u = []
for f in sorted(glob.glob(os.path.join(HERE, "..", "..", "..", "prompts", "runs", "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict) and usable(r):
        u.append(r)
xs, ys = loglog(u)
a, b, r2 = fit(xs, ys)
W, H, L, B, T = 560, 380, 60, 50, 30
x0, x1, y0, y1 = 0, math.log(1000), math.log(0.05), math.log(100)
px = lambda x: L + (x - x0) / (x1 - x0) * (W - L - 12)
py = lambda y: H - B - (y - y0) / (y1 - y0) * (H - B - T)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Run cost against tool calls, log axes">',
     '<style>text{font:12px sans-serif;fill:#222}</style><rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="18">Run cost (USD) against tool calls, {len(u)} runs, log axes; line: b={b:.2f}, R²={r2:.2f}</text>']
for v in (1, 10, 100, 1000):
    o.append(f'<text x="{px(math.log(v)) - 8:.0f}" y="{H - B + 16}">{v}</text><line x1="{px(math.log(v)):.0f}" x2="{px(math.log(v)):.0f}" y1="{T}" y2="{H - B}" stroke="#eee"/>')
for v in (0.1, 1, 10, 100):
    o.append(f'<text x="8" y="{py(math.log(v)) + 4:.0f}">${v:g}</text><line x1="{L}" x2="{W - 12}" y1="{py(math.log(v)):.0f}" y2="{py(math.log(v)):.0f}" stroke="#eee"/>')
for x, y in zip(xs, ys):
    o.append(f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="2.2" fill="#2a6fb0" fill-opacity=".4"/>')
o.append(f'<line x1="{px(x0):.0f}" y1="{py(a + b * x0):.0f}" x2="{px(x1):.0f}" y2="{py(a + b * x1):.0f}" stroke="#c0392b" stroke-width="1.5"/>')
o.append(f'<text x="{L + 200}" y="{H - 12}">tool calls per run</text></svg>')
open(os.path.join(HERE, "cost_vs_calls.svg"), "w").write("\n".join(o))
