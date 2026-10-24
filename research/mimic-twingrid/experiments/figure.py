"""Write experiments/regret_fixed_vs_aware.svg: real-system cost of twin-tuned controllers, fixed vs twin-aware gravity.

    python experiments/figure.py

Numbers come from the committed results_fixed.json and results_aware.json, never retyped.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
fixed = json.loads((HERE / "results_fixed.json").read_text())
aware = json.loads((HERE / "results_aware.json").read_text())
rows = [(f["twin"], f["regret"], a["regret"]) for f, a in zip(fixed, aware)][1:]
rows.sort(key=lambda r: -max(r[1], r[2]))
W, L, R, T, RH = 720, 190, 60, 56, 26
H = T + RH * len(rows) + 40
xmax = max(max(r[1], r[2]) for r in rows) * 1.05
px = lambda v: L + max(v, 0) / xmax * (W - L - R)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">',
     '<title id="t">Regret of controllers tuned on wrong pendulum twins, fixed against twin-aware gravity</title>',
     '<desc id="d">For each wrong twin, two bars: extra real-system cost when the controller keeps g/L = 9.81 in its energy estimate (blue) and when it uses the twin\'s own g/L (orange). Gravity errors dominate, and twin-aware gravity makes them worse.</desc>',
     '<style>text{font:12px sans-serif;fill:#222}.a{stroke:#555}@media(prefers-color-scheme:dark){text{fill:#ddd}.a{stroke:#aaa}}</style>',
     f'<text x="{L}" y="24" style="font-size:14px;font-weight:bold">Using the twin\'s gravity in the controller made gravity errors costlier</text>',
     f'<text x="{L}" y="42" style="font-size:11px">extra real cost (regret), mean of 8 tuning seeds; blue = fixed g/L 9.81, orange = twin-aware g/L</text>',
     f'<line class="a" x1="{L}" x2="{L}" y1="{T}" y2="{H - 30}"/>']
for i, (name, rf, ra) in enumerate(rows):
    y = T + i * RH
    o.append(f'<text x="{L - 8}" y="{y + 16}" text-anchor="end">{escape(name)}</text>')
    o.append(f'<rect x="{L}" y="{y + 2}" width="{px(rf) - L:.1f}" height="9" fill="#1f6fb2"><title>{escape(name)} fixed: {rf:.5f}</title></rect>')
    o.append(f'<rect x="{L}" y="{y + 12}" width="{px(ra) - L:.1f}" height="9" fill="#d98324"><title>{escape(name)} aware: {ra:.5f}</title></rect>')
    o.append(f'<text x="{px(max(rf, ra)) + 4:.1f}" y="{y + 16}" style="font-size:10px">{rf:.4f} / {ra:.4f}</text>')
o.append("</svg>")
(HERE / "regret_fixed_vs_aware.svg").write_text("\n".join(o) + "\n")
