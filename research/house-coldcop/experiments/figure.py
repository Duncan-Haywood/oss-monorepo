"""Write experiments/premium.svg from results.txt part B: break-even premium, constant COP against the central curve.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("B."))
    rows = []
    for l in TEXT[i + 2:i + 8]:
        m = re.match(r"\s+(.+?) \(\w+\)\s+(-?[\d,]+)\s+(-?[\d,]+)\s+-?[\d,]+$", l)
        if m:
            rows.append((m.group(1), int(m.group(2).replace(",", "")), int(m.group(3).replace(",", ""))))
    if len(rows) != 6:
        raise SystemExit("no rows parsed")
    W, H, T, B, L, R = 720, 380, 60, 60, 50, 30
    lo, hi = -9000, 3000
    py = lambda v: T + (hi - v) / (hi - lo) * (H - T - B)
    gw = (W - L - R) / len(rows)
    bw = gw * 0.32
    f = 'font-family="sans-serif"'
    alt = "Break-even heat pump premium, USD, constant COP 2.5 then temperature-dependent curve: " + "; ".join(
        f"{n}: {a:,} then {b:,}" for n, a, b in rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="24" text-anchor="middle" {f} font-size="14">Break-even heat pump premium (USD): constant COP 2.5 vs temperature-dependent COP</text>',
         f'<line x1="{L}" x2="{W-R}" y1="{py(0)}" y2="{py(0)}" stroke="#333"/>']
    for k, (n, a, b) in enumerate(rows):
        x0 = L + k * gw + gw * 0.12
        for j, (v, col) in enumerate(((a, "#999"), (b, "#1f6fb2"))):
            x = x0 + j * (bw + 4)
            y0, y1 = sorted((py(0), py(v)))
            o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bw:.1f}" height="{y1-y0:.1f}" fill="{col}"/>')
            ty = py(v) - 4 if v >= 0 else py(v) + 12
            o.append(f'<text x="{x+bw/2:.1f}" y="{ty:.1f}" text-anchor="middle" {f} font-size="10">{v:,}</text>')
        o.append(f'<text x="{x0+bw+2:.1f}" y="{H-B+18}" text-anchor="middle" {f} font-size="11">{n}</text>')
    o.append(f'<rect x="{L}" y="{H-24}" width="10" height="10" fill="#999"/><text x="{L+14}" y="{H-15}" {f} font-size="11">constant COP 2.5</text>')
    o.append(f'<rect x="{L+140}" y="{H-24}" width="10" height="10" fill="#1f6fb2"/><text x="{L+154}" y="{H-15}" {f} font-size="11">COP = max(1, 3.5 + 0.045 (T &#8722; 47 F))</text>')
    o.append("</svg>")
    (HERE / "premium.svg").write_text("\n".join(o) + "\n")
    print(HERE / "premium.svg")


if __name__ == "__main__":
    main()
