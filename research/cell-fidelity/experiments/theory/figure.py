"""Figure for milestone 3: each screen cell's affine Chebyshev residual (kappa_q) against its median DFN@100 calls.

    python experiments/theory/figure.py    # summary.json -> theory.svg (stdlib only)
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"SPM": "#2a6fb0", "SPMe": "#c0392b", "DFN": "#2e8b57"}


def main():
    C = json.loads((HERE / "summary.json").read_text())["cells"]
    W, H, l, r, t, b = 640, 400, 70, 20, 40, 55
    xs = [v["kappa_q"] for v in C.values()]
    xmax = math.ceil(max(xs) / 5) * 5
    ymax = 20
    X = lambda v: l + (W - l - r) * v / xmax
    Y = lambda v: H - b - (H - t - b) * v / ymax
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{l}" y="22" font-size="14" fill="#222">Residual after an affine fit tracks DFN calls (Spearman 0.72)</text>',
         f'<line x1="{l}" y1="{H - b}" x2="{W - r}" y2="{H - b}" stroke="#444"/>',
         f'<line x1="{l}" y1="{t}" x2="{l}" y2="{H - b}" stroke="#444"/>']
    for v in range(0, xmax + 1, 5):
        o.append(f'<text x="{X(v):.1f}" y="{H - b + 16}" text-anchor="middle" fill="#444">{v}</text>')
    for v in range(0, ymax + 1, 5):
        o.append(f'<text x="{l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" fill="#444">{v}</text>')
        o.append(f'<line x1="{l}" y1="{Y(v):.1f}" x2="{W - r}" y2="{Y(v):.1f}" stroke="#ddd"/>')
    o.append(f'<text x="{(l + W - r) / 2}" y="{H - 14}" text-anchor="middle" fill="#222">'
             'kappa_q: worst residual of the screen after the best affine map to DFN@100, top 25% (Wh/kg)</text>')
    o.append(f'<text transform="translate(18 {(t + H - b) / 2}) rotate(-90)" text-anchor="middle" fill="#222">'
             'median DFN@100 calls to within 1% (30 pools of 64)</text>')
    for k, v in C.items():
        m = k.split("@")[0]
        cx, cy = X(v["kappa_q"]), Y(v["R_median"])
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="{COL[m]}"/>')
        o.append(f'<text x="{cx + 7:.1f}" y="{cy - 6:.1f}" fill="{COL[m]}">{k}</text>')
    o.append("</svg>")
    (HERE / "theory.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
