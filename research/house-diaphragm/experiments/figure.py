"""Write experiments/split.svg: garage-line demand/capacity against door width, flexible vs rigid split, from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    rows, on = [], False
    for l in TEXT:
        if l.startswith("bending-softness"):
            on = "r = 1.0" in l
        m = re.match(r"\s*(\d+)ft\s+centred\s+[\d.]+\s+[\d.]+\s+[\d,]+\s+[\d,]+\s+[\d,]+\s+([\d.]+)\s+([\d.]+)", l)
        if on and m:
            rows.append((int(m.group(1)), float(m.group(2)), float(m.group(3))))
    if len(rows) != 5:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 380, 60, 20, 70, 50
    px = lambda v: L + (v - 8) / (23 - 8) * (W - L - R)
    py = lambda v: H - B - v / 1.2 * (H - T - B)
    f = 'font-family="sans-serif"'
    alt = "Garage-wall line demand over capacity at 6 inch nailing by centred door width: " + "; ".join(
        f"{w} ft flexible {a:.2f}, rigid {b:.2f}" for w, a, b in rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Garage-wall line demand over capacity, centred door, 115 mph</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Stylised toy stiffness (r = 1); 1.0 means 6 in nailing is just enough</text>']
    for g in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="{"#c0392b" if g == 1.0 else "#ddd"}"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g:.1f}</text>')
    for w, _, _ in rows:
        o.append(f'<text x="{px(w):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{w}</text>')
    o.append(f'<text x="{W/2}" y="{H-8}" text-anchor="middle" {f} font-size="11">garage door width, ft</text>')
    for i, (name, col) in enumerate((("flexible (half each)", "#b5651d"), ("rigid (stiffness split)", "#2a6f97"))):
        pts = " ".join(f"{px(r[0]):.1f},{py(r[1 + i]):.1f}" for r in rows)
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2.5"/>')
        o.append(f'<text x="{px(rows[-1][0]) - 8:.1f}" y="{py(rows[-1][1 + i]) + (-8 if i == 0 else 16):.1f}" text-anchor="end" {f} font-size="12" fill="{col}">{name}</text>')
    o.append("</svg>")
    (HERE / "split.svg").write_text("\n".join(o) + "\n")
    print("wrote split.svg")


main()
