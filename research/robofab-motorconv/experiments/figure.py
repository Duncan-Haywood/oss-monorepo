"""Write experiments/conv.svg from experiments/results.json: relative change of the six-part time-optimal total from n = 1600
to n = 6400, per row (arm size, jaw cap), against motor no-load speed w0. Standard library only; no new results.

    python experiments/figure.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, X0, X1, Y0, Y1 = 640, 380, 70, 610, 330, 60
F = 'font-family="sans-serif"'
XS = ["inf", "20", "10", "6", "4"]
COL = {2.0: "#c0392b", 5.0: "#2874a6", None: "#1e8449"}
DASH = {0.08: "", 0.12: "6 3", 0.2: "2 3"}


def main():
    rows = json.load(open(HERE / "results.json"))
    vals = [100 * r["rel_change_1600_6400"] for r in rows if r["rel_change_1600_6400"] is not None]
    ymax = max(0.5, max(vals) * 1.15)
    px = lambda i: X0 + i * (X1 - X0) / (len(XS) - 1)
    py = lambda e: Y0 - e / ymax * (Y0 - Y1)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Change in time-optimal carry time from 1600 to 6400 solver nodes against motor no-load speed">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">Time-optimal total: change from n = 1600 to n = 6400 vs motor no-load speed w0</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {F} font-size="11">stylised toy arm; colour = jaw cap k (red 2, blue 5, green none); dash = arm size (solid 0.08 m, dashed 0.12 m, dotted 0.2 m)</text>']
    for j in range(6):
        e = ymax * j / 5
        o.append(f'<line x1="{X0}" x2="{X1}" y1="{py(e):.1f}" y2="{py(e):.1f}" stroke="#ddd"/><text x="{X0-8}" y="{py(e)+4:.1f}" text-anchor="end" {F} font-size="11">{e:.2f}%</text>')
    for i, x in enumerate(XS):
        o.append(f'<text x="{px(i)}" y="{Y0+18}" text-anchor="middle" {F} font-size="11">{"constant" if x == "inf" else x}</text>')
    o.append(f'<text x="{(X0+X1)/2}" y="{Y0+38}" text-anchor="middle" {F} font-size="12">no-load speed w0 (rad/s)</text>')
    for L in (0.08, 0.12, 0.2):
        for k in (2.0, 5.0, None):
            pts = []
            for i, x in enumerate(XS):
                r = next((r for r in rows if abs(r["L"] - L) < 0.02 and r["k"] == k and ("inf" if r["w0"] is None else f'{r["w0"]:g}') == x), None)
                if r and r["rel_change_1600_6400"] is not None:
                    pts.append((px(i), py(100 * r["rel_change_1600_6400"])))
            if pts:
                d = f' stroke-dasharray="{DASH[L]}"' if DASH[L] else ""
                o.append(f'<polyline fill="none" stroke="{COL[k]}" stroke-width="2"{d} points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
    o.append("</svg>")
    (HERE / "conv.svg").write_text("\n".join(o))


main()
