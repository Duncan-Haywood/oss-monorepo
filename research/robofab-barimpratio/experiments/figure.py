"""Write experiments/barimpratio_bound_vs_mujoco.svg from experiments/results.json (section B: bar-at-one-end bounds against the MuJoCo minimum holding force at impratio 1000, 1 degree tolerance).

    python experiments/figure.py

Values are read from the committed results.json, never retyped: re-run run.py first if the
experiment changes. Standard library only. Stylised simulation, no new results.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, L, R, T, B = 640, 380, 64, 16, 40, 52
COL = ["#1f6fb2", "#2e8b57", "#c0392b", "#8e5ea2"]
F = 'font-family="sans-serif"'


def chart(title, aria, xlabel, ylabel, xr, yr, xt, yt, series, diag=False):
    """Line/scatter chart on linear axes. series: [(name, colour, [(x, y)], connect)]."""
    px = lambda x: L + (x - xr[0]) / (xr[1] - xr[0]) * (W - L - R)
    py = lambda y: T + (yr[1] - y) / (yr[1] - yr[0]) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{aria}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">{title}</text>']
    for t in yt:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(t):.1f}" y2="{py(t):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(t)+4:.1f}" text-anchor="end" {F} font-size="11">{t:g}</text>')
    for t in xt:
        o.append(f'<text x="{px(t):.1f}" y="{H-B+16}" text-anchor="middle" {F} font-size="11">{t:g}</text>')
    if diag:
        o.append(f'<line x1="{px(xr[0]):.1f}" y1="{py(yr[0]):.1f}" x2="{px(xr[1]):.1f}" y2="{py(yr[1]):.1f}" stroke="#888" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {F} font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {F} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for k, (name, col, pts, conn) in enumerate(series):
        if conn:
            o.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{" ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in pts)}"/>')
        for x, y in pts:
            o.append(f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="3" fill="{col}" fill-opacity="0.8"/>')
        ly = T + 34 + 16 * k
        o.append(f'<line x1="{W-250}" x2="{W-226}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                 f'<text x="{W-220}" y="{ly+4}" {F} font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def svg(d):
    rows = [r for r in d["B"] if r["mujoco"]["1000"]["rot1"] is not None]
    lo = [(r["lower_N"], r["mujoco"]["1000"]["rot1"]) for r in rows]
    pc = [(r["layout_N"], r["mujoco"]["1000"]["rot1"]) for r in rows]
    hi = max(max(p) for p in lo + pc) * 1.05
    return chart("Held bar: bounds vs MuJoCo at impratio 1000 (stylised)",
                 "MuJoCo minimum holding force at impratio 1000 and a 1 degree tolerance against two closed-form bounds; points on the dashed line would agree",
                 "closed-form bound (N)", "MuJoCo minimum force (N)", (0, hi), (0, hi),
                 [round(hi * i / 4, 2) for i in range(5)], [round(hi * i / 4, 2) for i in range(5)],
                 [("uniform-pressure lower bound", COL[0], lo, False), ("point-contact bound (MuJoCo layout)", COL[1], pc, False)], diag=True)


def main():
    d = json.loads((HERE / "results.json").read_text())
    (HERE / "barimpratio_bound_vs_mujoco.svg").write_text(svg(d))
    print("wrote barimpratio_bound_vs_mujoco.svg")


if __name__ == "__main__":
    main()
