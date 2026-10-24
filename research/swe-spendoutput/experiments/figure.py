"""Write experiments/cost_vs_tests.svg: cost against tests added (log-log), runs with tests_added > 0.

    python experiments/figure.py
"""
import json, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
runs = [json.loads(l) for l in (HERE / "runs_snapshot.jsonl").read_text().splitlines()]
pts = [(r["cost_usd"], r["tests_added"], r["track"]) for r in runs if (r["tests_added"] or 0) > 0 and r["cost_usd"] > 0]
col = {"research": "#2b6cb0", "ventures": "#c05621"}
W, H, L, T, B, R = 640, 380, 60, 40, 50, 16
xs = [math.log10(p[0]) for p in pts]; ys = [math.log10(p[1]) for p in pts]
x0, x1 = math.floor(min(xs)), math.ceil(max(xs)); y0, y1 = 0, math.ceil(max(ys))
px = lambda v: L + (v - x0) / (x1 - x0) * (W - L - R)
py = lambda v: H - B - (v - y0) / (y1 - y0) * (H - T - B)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Run cost against tests added, log-log, by track">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="{L}" y="22" font-family="sans-serif" font-size="14">Tests added against run cost (log-log); blue research, orange ventures, grey other</text>']
for e in range(x0, x1 + 1):
    o.append(f'<line x1="{px(e):.1f}" y1="{T}" x2="{px(e):.1f}" y2="{H - B}" stroke="#ddd"/><text x="{px(e):.1f}" y="{H - B + 16}" text-anchor="middle" font-family="sans-serif" font-size="11">${10 ** e:g}</text>')
for e in range(y0, y1 + 1):
    o.append(f'<line x1="{L}" y1="{py(e):.1f}" x2="{W - R}" y2="{py(e):.1f}" stroke="#ddd"/><text x="{L - 6}" y="{py(e) + 4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{10 ** e}</text>')
for c, n, t in pts:
    o.append(f'<circle cx="{px(math.log10(c)):.1f}" cy="{py(math.log10(n)):.1f}" r="3" fill="{col.get(t, "#888")}" fill-opacity="0.55"/>')
o.append(f'<text x="{(L + W - R) / 2}" y="{H - 10}" text-anchor="middle" font-family="sans-serif" font-size="12">cost per run (API-equivalent, log scale)</text>')
o.append(f'<text x="14" y="{(T + H - B) / 2}" transform="rotate(-90 14 {(T + H - B) / 2})" text-anchor="middle" font-family="sans-serif" font-size="12">tests added (log)</text></svg>')
(HERE / "cost_vs_tests.svg").write_text("\n".join(o) + "\n")
