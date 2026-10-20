"""Write experiments/offcentre_loss.svg: how much total width a two-span joist loses as the beam leaves the middle.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
RATIOS = (1.0, 0.9, 0.8, 0.7, 0.6, 0.5)
SERIES = (("A. floor, 2x10", "floor 2x10 (bending)", "#7a4a1d"), ("A. ceiling, 2x8", "ceiling 2x8 (deflection)", "#3b7ea1"))


def loss(prefix):
    i = next(k for k, l in enumerate(TEXT) if l.startswith(prefix))
    vals = [float(re.search(r"centred\s+([+-]\d+\.\d)%", l).group(1)) for l in TEXT[i + 1:i + 7]]
    assert len(vals) == 6
    return vals


def main():
    W, H, x0, y0, pw, ph = 640, 330, 70, 280, 520, 230
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Total clear width lost by a two-span joist as the beam moves off the middle">',
           '<style>text{font:12px sans-serif;fill:#333}</style>',
           f'<text x="{W/2}" y="20" text-anchor="middle" font-weight="bold">Total width lost as the beam leaves the middle (%)</text>']
    for g in range(0, 26, 5):
        y = y0 - g / 25 * ph
        out.append(f'<line x1="{x0}" x2="{x0+pw}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/><text x="{x0-8}" y="{y+4:.1f}" text-anchor="end">{-g}</text>')
    xs = [x0 + 20 + i * (pw - 40) / 5 for i in range(6)]
    for x, r in zip(xs, RATIOS):
        out.append(f'<text x="{x:.1f}" y="{y0+18}" text-anchor="middle">{r:.1f}</text>')
    out.append(f'<text x="{x0+pw/2}" y="{y0+36}" text-anchor="middle">short span / long span</text>')
    for k, (prefix, name, col) in enumerate(SERIES):
        v = loss(prefix)
        pts = [(x, y0 - (-a) / 25 * ph) for x, a in zip(xs, v)]
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2.5" points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}"/>')
        out += [f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{col}"/>' for x, y in pts]
        out.append(f'<text x="{pts[-1][0]-6:.1f}" y="{pts[-1][1]-8:.1f}" text-anchor="end" fill="{col}">{v[-1]:+.1f}%</text>')
        out.append(f'<rect x="{x0+20+k*220}" y="{H-22}" width="12" height="12" fill="{col}"/><text x="{x0+38+k*220}" y="{H-12}">{name}</text>')
    out.append("</svg>")
    (HERE / "offcentre_loss.svg").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
