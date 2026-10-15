"""Write experiments/edge.svg from experiments/results.json: the time-optimal carry's edge over the tuned trapezoid
(six-part totals) against the motor no-load speed w0, one line per row (arm size, jaw cap). The left-most point
is the constant torque limit (w0 = infinity). Standard library only; no new results.

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


def svg(rows):
    ymax = 30.0
    px = lambda i: X0 + i * (X1 - X0) / (len(XS) - 1)
    py = lambda e: Y0 - e / ymax * (Y0 - Y1)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Edge of the time-optimal carry over a tuned trapezoid against motor no-load speed">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">Time-optimal edge over a tuned trapezoid vs motor no-load speed w0</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {F} font-size="11">stylised toy arm; colour = jaw cap k (red 2, blue 5, green none); dash = arm size (solid 0.08 m, dashed 0.12 m, dotted 0.2 m)</text>']
    for e in range(0, 31, 5):
        o.append(f'<line x1="{X0}" x2="{X1}" y1="{py(e)}" y2="{py(e)}" stroke="#ddd"/><text x="{X0-8}" y="{py(e)+4}" text-anchor="end" {F} font-size="11">{e}%</text>')
    for i, x in enumerate(XS):
        o.append(f'<text x="{px(i)}" y="{Y0+18}" text-anchor="middle" {F} font-size="11">{"constant" if x == "inf" else x}</text>')
    o.append(f'<text x="{(X0+X1)/2}" y="{Y0+38}" text-anchor="middle" {F} font-size="12">no-load speed w0 (rad/s); torque limit 5 N m (1 - |speed| / w0)</text>')
    for L in (0.08, 0.12, 0.2):
        for k in (2.0, 5.0, None):
            pts = []
            for i, x in enumerate(XS):
                r = next((r for r in rows if abs(r["L"] - L) < 0.02 and r["k"] == k and ("inf" if r["w0"] is None else f'{r["w0"]:g}') == x), None)
                if r and r["edge"] is not None:
                    pts.append((px(i), py(100 * r["edge"])))
            if pts:
                d = f' stroke-dasharray="{DASH[L]}"' if DASH[L] else ""
                o.append(f'<polyline fill="none" stroke="{COL[k]}" stroke-width="2"{d} points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


if __name__ == "__main__":
    (HERE / "edge.svg").write_text(svg(json.loads((HERE / "results.json").read_text())))
