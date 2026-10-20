"""Write experiments/premium.svg from results.txt part A: break-even heat-pump premium by climate.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("A."))
    rows = []
    for l in TEXT[i + 2:i + 8]:
        m = re.match(r"\s+(.+?) \(\w+\)\s+[\d,]+\s+[\d,]+\s+(-?[\d,]+)$", l)
        if m:
            rows.append((m.group(1), int(m.group(2).replace(",", ""))))
    if len(rows) != 6:
        raise SystemExit("no rows parsed")
    W, H, T, B = 720, 360, 60, 50
    lo, hi = -8000, 2000
    L, R = 40, 30
    py = lambda v: T + (hi - v) / (hi - lo) * (H - T - B)
    bw = (W - L - R) / len(rows)
    f = 'font-family="sans-serif"'
    alt = "Break-even extra installed cost of a heat pump over gas furnace plus AC, USD: " + "; ".join(f"{n}: {v:,}" for n, v in rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="24" text-anchor="middle" {f} font-size="14">Heat pump premium over gas furnace + AC at which 30-year cost ties (USD)</text>',
         f'<text x="{W/2}" y="42" text-anchor="middle" {f} font-size="11" fill="#444">below zero: the heat pump would have to be cheaper to buy</text>',
         f'<line x1="{L}" x2="{W-R}" y1="{py(0)}" y2="{py(0)}" stroke="#000"/>']
    for k, (n, v) in enumerate(rows):
        x = L + k * bw + bw * 0.2
        y0, y1 = sorted((py(0), py(v)))
        o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bw*0.6:.1f}" height="{max(y1-y0,1):.1f}" fill="{"#1b6ca8" if v >= 0 else "#b5481f"}"/>')
        ty = py(v) - 6 if v >= 0 else py(v) + 14
        o.append(f'<text x="{x+bw*0.3:.1f}" y="{ty:.1f}" text-anchor="middle" {f} font-size="12">{v:,}</text>')
        o.append(f'<text x="{x+bw*0.3:.1f}" y="{H-B+18}" text-anchor="middle" {f} font-size="12">{n}</text>')
    o.append("</svg>")
    (HERE / "premium.svg").write_text("\n".join(o) + "\n")


main()
