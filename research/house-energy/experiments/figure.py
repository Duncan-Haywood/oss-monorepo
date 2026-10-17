"""Write experiments/savings.svg: NPC saving of the cost-optimal package over the baseline, by climate, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("A. cost-optimal"))
    data = {}
    for l in TEXT[i + 2:i + 18]:
        m = re.match(r"(.+?\(\w+\))\s+(gas furnace \+ AC|heat pump)\s+\d+\s+\d+\s+\$\s*([\d,]+)", l)
        if m:
            data.setdefault(m.group(1), {})[m.group(2)] = int(m.group(3).replace(",", ""))
    if len(data) != 8:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 720, 420, 60, 20, 70, 90
    hi = 5000
    py = lambda v: H - B - v / hi * (H - T - B)
    gw = (W - L - R) / len(data)
    f = 'font-family="sans-serif"'
    alt = "Bar chart of the 30-year net present cost saving of the cost-optimal envelope over a baseline house, by city: " + "; ".join(
        f"{c}: gas ${v['gas furnace + AC']:,}, heat pump ${v['heat pump']:,}" for c, v in data.items())
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">What the cost-optimal envelope saves over the baseline house, 30-year net present cost</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Stylised degree-day model; assumed prices; most of it is advanced framing at no extra cost</text>',
         f'<rect x="{L}" y="48" width="10" height="10" fill="#b5651d"/><text x="{L+14}" y="57" {f} font-size="11">gas furnace + AC</text>',
         f'<rect x="{L+130}" y="48" width="10" height="10" fill="#2a6f97"/><text x="{L+144}" y="57" {f} font-size="11">heat pump</text>']
    for g in range(0, hi + 1, 1000):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">${g:,}</text>')
    for k, (c, v) in enumerate(data.items()):
        x = L + k * gw + gw * 0.12
        bw = gw * 0.38
        for j, (s, col) in enumerate((("gas furnace + AC", "#b5651d"), ("heat pump", "#2a6f97"))):
            o.append(f'<rect x="{x + j*bw:.1f}" y="{py(v[s]):.1f}" width="{bw-2:.1f}" height="{H-B-py(v[s]):.1f}" fill="{col}"/>')
        name, zone = c.rsplit(" (", 1)
        cx = L + k * gw + gw / 2
        o.append(f'<text x="{cx:.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{name}</text>')
        o.append(f'<text x="{cx:.1f}" y="{H-B+30}" text-anchor="middle" {f} font-size="10" fill="#555">({zone}</text>')
    o.append("</svg>")
    (HERE / "savings.svg").write_text("\n".join(o) + "\n")
    print("wrote savings.svg")


main()
