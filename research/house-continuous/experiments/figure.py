"""Write experiments/ceiling_gain.svg: clear span of a 2x8 ceiling joist, simple vs 2-span vs 3-span, by spacing (SPF No. 2).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
SPACINGS = ("12", "16", "19.2", "24")
COLORS = ("#7a4a1d", "#b5651d", "#d9a066")
NAMES = ("simple span", "2-span continuous", "3-span continuous")


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("A. ceiling"))
    row = next(l for l in TEXT[i + 2:i + 8] if l.strip().startswith("2x8"))
    vals = [int(a) * 12 + int(b) for a, b in re.findall(r"(\d+)'\s*(\d+)\"", row)]
    assert len(vals) == 12
    W, H, x0, y0, bw = 640, 330, 60, 280, 18
    top = max(vals) / 12 * 1.1
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Clear span of a 2x8 ceiling joist at four spacings: simple span against two- and three-span continuous">',
           '<style>text{font:12px sans-serif;fill:#333}</style>',
           f'<text x="{W/2}" y="20" text-anchor="middle" font-weight="bold">2x8 SPF ceiling joist: clear span per span (ft)</text>']
    for g in range(0, int(top) + 1, 5):
        y = y0 - g / top * 230
        out.append(f'<line x1="{x0}" x2="{W-20}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/><text x="{x0-8}" y="{y+4:.1f}" text-anchor="end">{g}</text>')
    for gi, sp in enumerate(SPACINGS):
        gx = x0 + 20 + gi * 140
        for k in range(3):
            v = vals[gi * 3 + k] / 12
            h = v / top * 230
            out.append(f'<rect x="{gx + k*(bw+4)}" y="{y0-h:.1f}" width="{bw}" height="{h:.1f}" fill="{COLORS[k]}"/>')
            out.append(f'<text x="{gx + k*(bw+4) + bw/2}" y="{y0-h-4:.1f}" text-anchor="middle" font-size="10">{v:.1f}</text>')
        out.append(f'<text x="{gx+32}" y="{y0+18}" text-anchor="middle">{sp} in o.c.</text>')
    for k in range(3):
        out.append(f'<rect x="{x0+20+k*160}" y="{H-22}" width="12" height="12" fill="{COLORS[k]}"/><text x="{x0+38+k*160}" y="{H-12}">{NAMES[k]}</text>')
    out.append("</svg>")
    (HERE / "ceiling_gain.svg").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
