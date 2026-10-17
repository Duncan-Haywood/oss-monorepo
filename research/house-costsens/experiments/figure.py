"""Write experiments/ranking.svg: each lever's price swing (5th to 95th percentile) at k=20, parsed from results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if "concentration k=20" in l)
    rows = []
    for l in TEXT[i + 1:i + 11]:
        m = re.match(r"\s+(.+?)\s+([\d.]+) \(\s*([\d.]+) to\s+([\d.]+)\)", l)
        if m:
            rows.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))))
    if len(rows) != 10:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 700, 400, 270, 30, 62, 40
    hi = 30.0
    px = lambda v: L + v / hi * (W - L - R)
    rh = (H - T - B) / len(rows)
    f = 'font-family="sans-serif"'
    alt = ("Bar chart of each lever's price swing in index points when house-cost's driver splits are redrawn "
           "(median bar, 5th to 95th percentile whisker): " + "; ".join(f"{n}: {m:.1f} ({a:.1f} to {b:.1f})" for n, m, a, b in rows))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Price swing of each lever when the assumed driver splits are redrawn</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Median and 5th to 95th percentile, 2,000 draws, Dirichlet k=20; stylised model</text>']
    for g in range(0, int(hi) + 1, 5):
        o.append(f'<line x1="{px(g):.1f}" x2="{px(g):.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/>')
        o.append(f'<text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{g}</text>')
    for k, (n, m, a, b) in enumerate(rows):
        y = T + k * rh + 4
        yc = y + (rh - 8) / 2
        o.append(f'<rect x="{px(0):.1f}" y="{y:.1f}" width="{px(m)-px(0):.1f}" height="{rh-8:.1f}" fill="#b5651d"/>')
        o.append(f'<line x1="{px(a):.1f}" x2="{px(b):.1f}" y1="{yc:.1f}" y2="{yc:.1f}" stroke="#222" stroke-width="2"/>')
        o.append(f'<text x="{L-8}" y="{yc+4:.1f}" text-anchor="end" {f} font-size="11">{n}</text>')
        o.append(f'<text x="{px(max(b, m))+4:.1f}" y="{yc+4:.1f}" {f} font-size="10">{m:.1f}</text>')
    o.append("</svg>")
    (HERE / "ranking.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "ranking.svg")


if __name__ == "__main__":
    main()
