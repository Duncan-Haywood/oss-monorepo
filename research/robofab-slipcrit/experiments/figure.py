"""Write experiments/spread.svg from experiments/results.json: spread (max/min of the minimum holding
force across 8 solver settings) per bar length for the three criteria, log-scaled bars.

    python experiments/figure.py

Values are read from the committed results.json. Standard library only. No new results."""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, L, R, T, B = 640, 360, 64, 16, 40, 52
COL = {"tol1": "#c0392b", "tol5": "#2e8b57", "rate": "#1f6fb2"}
NAME = {"tol1": "1 deg tolerance", "tol5": "5 deg tolerance", "rate": "rate (2 mm in 3 s)"}
F = 'font-family="sans-serif"'


def svg(d):
    lens = sorted({s["L"] for s in d["spread"]})
    ymax = math.log10(400)
    py = lambda v: T + (ymax - math.log10(max(v, 1.0))) / ymax * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Spread of minimum holding force across solver settings, by bar length and criterion">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">Spread of min holding force across 8 solver settings (max/min, log)</text>']
    for t in (1, 10, 100, 400):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(t):.1f}" y2="{py(t):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(t)+4:.1f}" text-anchor="end" {F} font-size="11">{t}</text>')
    gw = (W - L - R) / len(lens)
    for i, Lm in enumerate(lens):
        x0 = L + i * gw + gw * 0.12
        bw = gw * 0.76 / 3
        for j, c in enumerate(("tol1", "tol5", "rate")):
            r = next(s["ratio"] for s in d["spread"] if s["L"] == Lm and s["crit"] == c)
            y = py(r)
            o.append(f'<rect x="{x0 + j*bw:.1f}" y="{y:.1f}" width="{bw-3:.1f}" height="{H-B-y:.1f}" fill="{COL[c]}"/>')
        o.append(f'<text x="{L + (i+0.5)*gw:.1f}" y="{H-B+16}" text-anchor="middle" {F} font-size="11">{Lm} mm bar</text>')
    for k, c in enumerate(("tol1", "tol5", "rate")):
        ly = T + 10 + 16 * k
        o.append(f'<rect x="{L+10}" y="{ly-8}" width="14" height="10" fill="{COL[c]}"/><text x="{L+30}" y="{ly+1}" {F} font-size="11">{NAME[c]}</text>')
    o.append(f'<text x="{W/2}" y="{H-12}" text-anchor="middle" {F} font-size="11">settings that fail even at 20 N are counted as 20 N</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


if __name__ == "__main__":
    d = json.loads((HERE / "results.json").read_text())
    (HERE / "spread.svg").write_text(svg(d))
