"""Write experiments/floor_spans.svg: maximum clear floor-joist span by size and spacing (SPF No. 2, 40 psf live + 10 dead).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
SPACINGS = ("12", "16", "19.2", "24")
COLORS = ("#7a4a1d", "#b5651d", "#d9a066", "#ecd0a8")


def main():
    i = TEXT.index("floor, SPF")
    rows = []
    for l in TEXT[i + 2:i + 6]:
        m = re.match(r"\s+(2x\d+)\s+(.*)", l)
        vals = [int(a) + int(b) / 12 for a, b in re.findall(r"(\d+)'\s*(\d+)\"", m.group(2))]
        rows.append((m.group(1), vals))
    if len(rows) != 4 or any(len(v) != 4 for _, v in rows):
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 340, 56, 20, 70, 50
    ymax = 22.0
    py = lambda v: H - B - v / ymax * (H - B - T)
    f = 'font-family="sans-serif"'
    alt = "Grouped bar chart of the longest clear floor-joist span in feet for SPF No. 2 at 12, 16, 19.2 and 24 inch spacing: " + "; ".join(
        f"{n}: " + ", ".join(f"{v:.1f}" for v in vals) for n, vals in rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Longest clear floor-joist span, SPF No. 2, 40 psf live + 10 psf dead</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">bending, shear, L/360 live and L/240 total deflection, bearing; vibration not checked</text>']
    for g in range(0, 23, 5):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g}</text>')
    gw = (W - L - R) / len(rows)
    bw = gw / 6
    for gi, (n, vals) in enumerate(rows):
        x0 = L + gi * gw + gw / 2 - 2 * bw
        for k, v in enumerate(vals):
            x = x0 + k * bw
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{bw-2:.1f}" height="{H-B-py(v):.1f}" fill="{COLORS[k]}"/>')
            o.append(f'<text x="{x+bw/2-1:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" {f} font-size="10">{v:.1f}</text>')
        o.append(f'<text x="{L+gi*gw+gw/2:.1f}" y="{H-B+18}" text-anchor="middle" {f} font-size="12">{n}</text>')
    for k, s in enumerate(SPACINGS):
        o.append(f'<rect x="{L+k*92}" y="{H-18}" width="10" height="10" fill="{COLORS[k]}"/>')
        o.append(f'<text x="{L+k*92+14}" y="{H-9}" {f} font-size="11">{s} in o.c.</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" transform="rotate(-90 14 {(T+H-B)/2})" text-anchor="middle" {f} font-size="12">clear span (ft)</text>')
    o.append("</svg>")
    (HERE / "floor_spans.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "floor_spans.svg")


if __name__ == "__main__":
    main()
