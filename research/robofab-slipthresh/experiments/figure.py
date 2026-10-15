"""Write experiments/spread.svg from experiments/results.json: a heat map of the worst-case spread (over
bar lengths) of the minimum holding force across 8 solver settings, for each task time and tip bound of
the rate criterion. Darker = more settings-dependent. Standard library only. No new results.

    python experiments/figure.py
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, L, T = 640, 380, 120, 60
F = 'font-family="sans-serif"'


def colour(v):
    t = min(1.0, math.log10(max(v, 1.0)) / math.log10(400))
    g = int(235 - 190 * t)
    return f"rgb({int(255 - 60 * t)},{g},{int(235 - 200 * t)})"


def svg(d):
    tasks = sorted({s["task_s"] for s in d["summary"]})
    tips = sorted({s["tip_mm"] for s in d["summary"]})
    cw, ch = 110, 62
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Worst-case spread of minimum holding force across solver settings, by task time and tip bound">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">Worst-case spread (max/min over 8 settings, over 4 bar lengths)</text>',
         f'<text x="{W/2}" y="42" text-anchor="middle" {F} font-size="11">rows: task time T; columns: tip bound; 400 = settings fail at 20 N</text>']
    for j, tip in enumerate(tips):
        o.append(f'<text x="{L + j*cw + cw/2}" y="{T+12}" text-anchor="middle" {F} font-size="11">{tip:g} mm</text>')
    for i, t in enumerate(tasks):
        y = T + 20 + i * ch
        o.append(f'<text x="{L-8}" y="{y + ch/2 + 4}" text-anchor="end" {F} font-size="11">T = {t:g} s</text>')
        for j, tip in enumerate(tips):
            s = next(r for r in d["summary"] if r["task_s"] == t and r["tip_mm"] == tip)
            o.append(f'<rect x="{L + j*cw}" y="{y}" width="{cw-2}" height="{ch-2}" fill="{colour(s["worst_spread"])}"/>'
                     f'<text x="{L + j*cw + cw/2}" y="{y + ch/2 + 4}" text-anchor="middle" {F} font-size="13">{s["worst_spread"]:.1f}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


if __name__ == "__main__":
    d = json.loads((HERE / "results.json").read_text())
    (HERE / "spread.svg").write_text(svg(d))
