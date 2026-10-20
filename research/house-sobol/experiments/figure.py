"""Write experiments/sobol.svg: first-order and total Sobol index of each input for the price index (sigma=0.5),
parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("A. sigma=0.5, output: price index"))
    rows = []
    for l in TEXT[i + 3:i + 15]:
        m = re.match(r"\s+(\S+)\s+(-?[\d.]+) \(.*?\)\s+(-?[\d.]+) \(", l)
        if m:
            rows.append((m.group(1), max(float(m.group(2)), 0.0), float(m.group(3))))
    if len(rows) != 12:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 700, 440, 150, 40, 70, 40
    hi = 0.6
    px = lambda v: L + v / hi * (W - L - R)
    rh = (H - T - B) / len(rows)
    f = 'font-family="sans-serif"'
    alt = ("Bar chart of the first-order and total Sobol index of each input of the house-cost price index: "
           + "; ".join(f"{n}: first-order {a:.3f}, total {b:.3f}" for n, a, b in rows))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Share of the price index variance each uncertain input explains</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Sobol indices, 4,096 base samples, driver-split tilt sigma 0.5; stylised model</text>',
         f'<rect x="{L}" y="48" width="10" height="10" fill="#b5651d"/><text x="{L+14}" y="57" {f} font-size="11">first-order (alone)</text>',
         f'<rect x="{L+130}" y="48" width="10" height="10" fill="#444"/><text x="{L+144}" y="57" {f} font-size="11">total (with interactions)</text>']
    for g in (0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
        o.append(f'<line x1="{px(g):.1f}" x2="{px(g):.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/>')
        o.append(f'<text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{g:g}</text>')
    for k, (n, a, b) in enumerate(rows):
        y = T + k * rh + 2
        h = (rh - 4) / 2
        o.append(f'<rect x="{px(0):.1f}" y="{y:.1f}" width="{px(a)-px(0):.1f}" height="{h:.1f}" fill="#b5651d"/>')
        o.append(f'<rect x="{px(0):.1f}" y="{y+h:.1f}" width="{px(b)-px(0):.1f}" height="{h:.1f}" fill="#444"/>')
        o.append(f'<text x="{L-8}" y="{y+h+4:.1f}" text-anchor="end" {f} font-size="11">{n}</text>')
        o.append(f'<text x="{px(max(a, b))+4:.1f}" y="{y+h+4:.1f}" {f} font-size="10">{b:.3f}</text>')
    o.append("</svg>")
    (HERE / "sobol.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "sobol.svg")


if __name__ == "__main__":
    main()
