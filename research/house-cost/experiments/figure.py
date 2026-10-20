"""Write experiments/levers.svg: price swing of each lever, parsed from the committed results.txt.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("B. Lever ranges"))
    rows = []
    for l in TEXT[i + 1:i + 14]:
        m = re.match(r"\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+swing\s+([\d.]+)", l)
        if m:
            rows.append((m.group(1), float(m.group(2)), float(m.group(3))))
    if len(rows) != 10:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 700, 400, 270, 30, 62, 40
    lo, hi = 85.0, 115.0
    px = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
    rh = (H - T - B) / len(rows)
    f = 'font-family="sans-serif"'
    alt = "Bar chart of the price index (reference house = 100) at the low and high end of each lever: " + "; ".join(
        f"{n}: {a:.1f} to {b:.1f}" for n, a, b in rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Which levers move a new home\'s price most (reference house = 100)</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Ranges are assumptions; shares anchored on NAHB 2024; stylised model</text>']
    for g in range(lo.__int__(), hi.__int__() + 1, 5):
        o.append(f'<line x1="{px(g):.1f}" x2="{px(g):.1f}" y1="{T}" y2="{H-B}" stroke="{"#555" if g == 100 else "#ddd"}"/>')
        o.append(f'<text x="{px(g):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{g}</text>')
    for k, (n, a, b) in enumerate(rows):
        y = T + k * rh + 4
        x0, x1 = sorted((px(a), px(b)))
        o.append(f'<rect x="{x0:.1f}" y="{y:.1f}" width="{x1-x0:.1f}" height="{rh-8:.1f}" fill="#b5651d"/>')
        o.append(f'<text x="{L-8}" y="{y+rh/2:.1f}" text-anchor="end" {f} font-size="11">{n}</text>')
        o.append(f'<text x="{x0-4:.1f}" y="{y+rh/2:.1f}" text-anchor="end" {f} font-size="10">{min(a,b):.1f}</text>')
        o.append(f'<text x="{x1+4:.1f}" y="{y+rh/2:.1f}" {f} font-size="10">{max(a,b):.1f}</text>')
    o.append("</svg>")
    (HERE / "levers.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "levers.svg")


if __name__ == "__main__":
    main()
