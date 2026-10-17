"""Write experiments/spread.svg from experiments/results.json: worst-case spread (over bar lengths) of the
minimum holding force across 8 solver settings against the allowed tip speed (tip bound / task time), one line
per (friction mu, lift acceleration az) condition. Standard library only. No new results.

    python experiments/figure.py
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, L, R, T, B = 680, 400, 70, 150, 50, 50
F = 'font-family="sans-serif"'
COLOURS = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#a6761d"]


def svg(d):
    conds = sorted({(r["mu"], r["az"]) for r in d["summary"]})
    pw, ph = W - L - R, H - T - B
    xs, xe = math.log10(0.07), math.log10(30)
    ye = math.log10(500)

    def X(v):
        return L + (math.log10(v) - xs) / (xe - xs) * pw

    def Y(v):
        return T + ph - math.log10(v) / ye * ph

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Worst-case spread of minimum holding force across solver settings against allowed tip speed, for six friction and lift conditions">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">Settings-dependence vs allowed tip speed</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {F} font-size="11">worst spread over 4 bars of the minimum holding force across 8 solver settings (400 = fails at 20 N)</text>']
    for v in (1, 2, 5, 10, 20, 50, 100, 200):
        o.append(f'<line x1="{L}" x2="{L+pw}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#ddd"/><text x="{L-6}" y="{Y(v)+4:.1f}" text-anchor="end" {F} font-size="10">{v}</text>')
    for v in (0.1, 0.3, 1, 3, 10, 20):
        o.append(f'<text x="{X(v):.1f}" y="{T+ph+16}" text-anchor="middle" {F} font-size="10">{v:g}</text>')
    o.append(f'<text x="{L+pw/2}" y="{H-12}" text-anchor="middle" {F} font-size="11">allowed tip speed, tip bound / task time (mm/s)</text>')
    for i, (mu, az) in enumerate(conds):
        pts = {}
        for r in d["summary"]:
            if (r["mu"], r["az"]) == (mu, az):
                pts.setdefault(round(r["tip_mm"] / r["task_s"], 4), r["worst_spread"])
        pts = sorted(pts.items())
        c = COLOURS[i % len(COLOURS)]
        o.append(f'<polyline fill="none" stroke="{c}" stroke-width="1.5" points="' + " ".join(f"{X(v):.1f},{Y(s):.1f}" for v, s in pts) + '"/>')
        o += [f'<circle cx="{X(v):.1f}" cy="{Y(s):.1f}" r="3" fill="{c}"/>' for v, s in pts]
        y = T + 20 + i * 18
        o.append(f'<rect x="{L+pw+14}" y="{y-9}" width="10" height="10" fill="{c}"/><text x="{L+pw+30}" y="{y}" {F} font-size="11">mu {mu:g}, az {az:g} m/s&#178;</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


if __name__ == "__main__":
    d = json.loads((HERE / "results.json").read_text())
    (HERE / "spread.svg").write_text(svg(d))
