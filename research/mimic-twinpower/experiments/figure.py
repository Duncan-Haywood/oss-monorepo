"""Write experiments/power_vs_n.svg: C2ST power against the number of real trajectories, one line per wrong twin.

    python experiments/figure.py

Numbers come from the committed results.json, never retyped: re-run run.py first if the experiment changes.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
d = json.loads((HERE / "results.json").read_text())
ns, rows = d["ns"], [r for r in d["rows"] if not r["twin"].startswith("exact")]
W, H, L, R, T, B = 720, 420, 60, 20, 60, 56
import math
px = lambda n: L + (math.log(n) - math.log(ns[0])) / (math.log(ns[-1]) - math.log(ns[0])) * (W - L - R)
py = lambda v: H - B - v * (H - B - T)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">',
     '<title id="t">Power of a classifier test to flag a wrong pendulum twin, by number of real trajectories</title>',
     '<desc id="d">One line per wrong twin: share of replicates in which the C2ST AUROC beats the 95th percentile of the exact-twin null, against the number of real trajectories. Red lines are twins whose controller regret is at least 0.001, blue lines cost nothing, grey lines are in between.</desc>',
     '<style>text{font:12px sans-serif;fill:#222}.g{stroke:#ddd}.a{stroke:#555}@media(prefers-color-scheme:dark){text{fill:#ddd}.g{stroke:#444}.a{stroke:#aaa}}</style>',
     f'<rect width="{W}" height="{H}" fill="none"/>',
     f'<text x="{L}" y="24" style="font-size:14px;font-weight:bold">Every twin that costs a controller something is flagged by 80 real trajectories</text>',
     f'<text x="{L}" y="42" style="font-size:12px">so are some that cost nothing, so a flag is not a verdict</text>']
for v in (0, 0.25, 0.5, 0.75, 1.0):
    o.append(f'<line class="g" x1="{L}" x2="{W - R}" y1="{py(v):.1f}" y2="{py(v):.1f}"/><text x="{L - 6}" y="{py(v) + 4:.1f}" text-anchor="end">{v:.2f}</text>')
for n in ns:
    o.append(f'<line class="g" x1="{px(n):.1f}" x2="{px(n):.1f}" y1="{T}" y2="{H - B}"/><text x="{px(n):.1f}" y="{H - B + 16}" text-anchor="middle">{n}</text>')
o.append(f'<line class="a" x1="{L}" x2="{W - R}" y1="{H - B}" y2="{H - B}"/><line class="a" x1="{L}" x2="{L}" y1="{T}" y2="{H - B}"/>')
o.append(f'<text x="{(L + W - R) / 2}" y="{H - 14}" text-anchor="middle">real trajectories (and as many twin trajectories)</text>')
o.append(f'<text transform="translate(16 {(T + H - B) / 2}) rotate(-90)" text-anchor="middle">power (share of replicates flagged)</text>')
for r in rows:
    col = "#c0392b" if r["regret"] >= 0.001 else ("#1f6fb2" if r["regret"] == 0 else "#888")
    pts = " ".join(f"{px(n):.1f},{py(p):.1f}" for n, p in zip(ns, r["power"]))
    o.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" opacity="0.8" points="{pts}"><title>{escape(r["twin"])}: regret {r["regret"]:.5f}</title></polyline>')
o.append(f'<text x="{W - R}" y="{T + 14}" text-anchor="end" style="fill:#c0392b">red: regret &#8805; 0.001</text><text x="{W - R}" y="{T + 30}" text-anchor="end" style="fill:#1f6fb2">blue: regret exactly 0</text><text x="{W - R}" y="{T + 46}" text-anchor="end" style="fill:#888">grey: in between</text>')
o.append("</svg>")
(HERE / "power_vs_n.svg").write_text("\n".join(o) + "\n")
