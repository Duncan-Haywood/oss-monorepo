"""Write experiments/auroc_vs_regret.svg: C2ST AUROC against the real-system cost of twin-tuned gains.

    python experiments/figure.py

Numbers come from the committed results.json, never retyped: re-run run.py first if the experiment changes.
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
rows = json.loads((HERE / "results.json").read_text())
W, H, L, R, T, B = 720, 420, 70, 20, 50, 56
ymax = max(r["regret"] for r in rows) * 1.12
px = lambda a: L + (a - 0.45) / 0.58 * (W - L - R)
py = lambda v: H - B - v / ymax * (H - B - T)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">',
     '<title id="t">Detectability of a wrong digital twin against the cost of tuning on it</title>',
     '<desc id="d">Each point is one wrong pendulum twin: C2ST AUROC on the x axis, mean extra real-system cost of a controller tuned on the twin on the y axis. Most twins that the classifier separates from the real system cost nothing extra.</desc>',
     '<style>text{font:12px sans-serif;fill:#222}.g{stroke:#ddd}.a{stroke:#555}@media(prefers-color-scheme:dark){text{fill:#ddd}.g{stroke:#444}.a{stroke:#aaa}}</style>',
     f'<rect width="{W}" height="{H}" fill="none"/>',
     f'<text x="{L}" y="24" style="font-size:14px;font-weight:bold">A twin the classifier can tell apart is mostly harmless to tune on</text>']
for v in (0, 0.002, 0.004, 0.006, 0.008, 0.01):
    if v <= ymax:
        o.append(f'<line class="g" x1="{L}" x2="{W - R}" y1="{py(v):.1f}" y2="{py(v):.1f}"/><text x="{L - 6}" y="{py(v) + 4:.1f}" text-anchor="end">{v:.3f}</text>')
for a in (0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
    o.append(f'<line class="g" x1="{px(a):.1f}" x2="{px(a):.1f}" y1="{T}" y2="{H - B}"/><text x="{px(a):.1f}" y="{H - B + 16}" text-anchor="middle">{a:.1f}</text>')
o.append(f'<line class="a" x1="{L}" x2="{W - R}" y1="{H - B}" y2="{H - B}"/><line class="a" x1="{L}" x2="{L}" y1="{T}" y2="{H - B}"/>')
o.append(f'<text x="{(L + W - R) / 2}" y="{H - 14}" text-anchor="middle">C2ST AUROC of the twin against the real system (0.5 = cannot tell)</text>')
o.append(f'<text transform="translate(16 {(T + H - B) / 2}) rotate(-90)" text-anchor="middle">extra real cost of twin-tuned gains (regret)</text>')
for r in rows:
    null = r["twin"].startswith("exact")
    kind = "#c0392b" if r["twin"].startswith("noise") or r["twin"].startswith("gauss") else "#1f6fb2"
    x, y = px(r["auroc"]), py(r["regret"])
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{"none" if null else kind}" stroke="{kind}" stroke-width="2"><title>{escape(r["twin"])}: AUROC {r["auroc"]:.3f}, regret {r["regret"]:.5f}</title></circle>')
    if r["regret"] > 0.0012 or null:
        o.append(f'<text x="{x - 8:.1f}" y="{y - 8:.1f}" text-anchor="end" style="font-size:11px">{escape(r["twin"])}</text>')
o.append(f'<text x="{W - R}" y="{T + 14}" text-anchor="end" style="fill:#1f6fb2">blue: dynamics errors</text><text x="{W - R}" y="{T + 30}" text-anchor="end" style="fill:#c0392b">red: sensor-noise errors</text>')
o.append("</svg>")
(HERE / "auroc_vs_regret.svg").write_text("\n".join(o) + "\n")
