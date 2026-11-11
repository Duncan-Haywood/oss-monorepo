"""Rank agreement with 100-cycle DFN against the cost of each (model, cycles) screen (stdlib only).
    python experiments/cycles/figure.py   # reads summary.json, writes cycles.svg"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, ML, MR, MT, MB = 640, 420, 70, 110, 40, 55
COL = {"SPM": "#2ca02c", "SPMe": "#1f77b4", "DFN": "#d62728"}


def main():
    s = json.loads((HERE / "summary.json").read_text())["cells"]
    pts = [(k.split("@")[0], int(k.split("@")[1]), v["cost_s"], v["spearman"]) for k, v in s.items()]
    x0, x1 = math.log10(0.2), math.log10(60)
    lo = min(0.0, min(p[3] for p in pts) - 0.05)
    y0, y1 = lo, 1.0
    sx = lambda v: ML + (math.log10(v) - x0) / (x1 - x0) * (W - ML - MR)
    sy = lambda v: H - MB - (v - y0) / (y1 - y0) * (H - MT - MB)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         '<style>.t{fill:#333}.g{stroke:#ddd}@media(prefers-color-scheme:dark){.t{fill:#ddd}.g{stroke:#444}}</style>',
         f'<text class="t" x="{ML}" y="22" font-size="14">How well each cheap screen ranks 128 designs by 100-cycle DFN Wh/kg</text>']
    for v in (0.3, 1, 3, 10, 30):
        o.append(f'<line class="g" x1="{sx(v):.1f}" y1="{MT}" x2="{sx(v):.1f}" y2="{H-MB}"/>'
                 f'<text class="t" x="{sx(v):.1f}" y="{H-MB+16}" text-anchor="middle">{v:g}</text>')
    step = 0.2 if y1 - y0 > 0.6 else 0.1
    v = math.ceil(y0 / step) * step
    while v <= y1 + 1e-9:
        o.append(f'<line class="g" x1="{ML}" y1="{sy(v):.1f}" x2="{W-MR}" y2="{sy(v):.1f}"/>'
                 f'<text class="t" x="{ML-6}" y="{sy(v)+4:.1f}" text-anchor="end">{v:.1f}</text>')
        v += step
    for m in COL:
        line = sorted((p for p in pts if p[0] == m and p[2]), key=lambda p: p[1])
        o.append('<polyline fill="none" stroke="{}" stroke-width="1.5" points="{}"/>'.format(
            COL[m], " ".join(f"{sx(p[2]):.1f},{sy(p[3]):.1f}" for p in line)))
        for p in line:
            o.append(f'<circle cx="{sx(p[2]):.1f}" cy="{sy(p[3]):.1f}" r="4.5" fill="{COL[m]}"/>'
                     f'<text class="t" x="{sx(p[2])+6:.1f}" y="{sy(p[3])-6:.1f}" font-size="10">{p[1]}</text>')
        if line:
            o.append(f'<text x="{W-MR+8}" y="{sy(line[-1][3])+4:.1f}" fill="{COL[m]}">{m}</text>')
    o.append(f'<text class="t" x="{(ML+W-MR)/2}" y="{H-14}" text-anchor="middle">wall time of one run on the baseline design, s (log scale; labels = cycles)</text>')
    o.append(f'<text class="t" transform="translate(18,{(MT+H-MB)/2}) rotate(-90)" text-anchor="middle">Spearman with DFN at cycle 100</text>')
    o.append('</svg>')
    (HERE / "cycles.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
