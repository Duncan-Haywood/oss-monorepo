"""Write experiments/orientation.svg: NPC at stake in choosing which way the windows face, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("D. "))
    data = {}
    for l in TEXT[i + 1:i + 9]:
        m = re.match(r"\s+(.+?\(\w+\))\s+gas furnace \+ AC \$([\d,]+) \| heat pump \$([\d,]+)", l)
        if m:
            data[m.group(1)] = (int(m.group(2).replace(",", "")), int(m.group(3).replace(",", "")))
    if len(data) != 8:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 720, 400, 60, 20, 60, 90
    hi = 2000
    py = lambda v: H - B - v / hi * (H - T - B)
    gw = (W - L - R) / len(data)
    f = 'font-family="sans-serif"'
    alt = ("Bar chart of the 30-year net present cost difference between the best and worst glazing orientation split, by city: "
           + "; ".join(f"{c}: gas ${g:,}, heat pump ${h:,}" for c, (g, h) in data.items()))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">What choosing window orientation is worth, 30-year net present cost (best minus worst split)</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">stylised degree-day model, assumed prices; blue = gas furnace, orange = heat pump</text>']
    for v in range(0, hi + 1, 500):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v)}" y2="{py(v)}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4}" text-anchor="end" {f} font-size="11">${v:,}</text>')
    for k, (c, (g, h)) in enumerate(data.items()):
        x = L + k * gw + gw * 0.12
        bw = gw * 0.38
        for j, (v, col) in enumerate(((g, "#1f6fb2"), (h, "#d9822b"))):
            o.append(f'<rect x="{x + j*bw:.1f}" y="{py(v):.1f}" width="{bw-2:.1f}" height="{py(0)-py(v):.1f}" fill="{col}"/>')
        cx = L + k * gw + gw / 2
        o.append(f'<text x="{cx:.1f}" y="{H-B+16}" text-anchor="end" transform="rotate(-35 {cx:.1f} {H-B+16})" {f} font-size="11">{c}</text>')
    o.append("</svg>")
    (HERE / "orientation.svg").write_text("\n".join(o) + "\n")
    print("wrote orientation.svg")


main()
