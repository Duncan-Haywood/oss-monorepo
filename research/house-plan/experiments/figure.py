"""Write experiments/search_gap.svg: median gap to the exhaustive optimum, random vs local search, by budget.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
COLORS = {"random": "#9aa5b1", "local": "#b5651d"}


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("D. Search methods"))
    data = {}
    for l in TEXT[i:i + 12]:
        m = re.match(r"\s*(\d+)\s+(random|local)\s+(\d+)/40\s+([\d.]+)", l)
        if m:
            data.setdefault(int(m.group(1)), {})[m.group(2)] = float(m.group(4))
    if len(data) != 3 or any(len(v) != 2 for v in data.values()):
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 640, 340, 56, 20, 70, 56
    ymax = 1.0
    py = lambda v: H - B - v / ymax * (H - B - T)
    f = 'font-family="sans-serif"'
    alt = "Grouped bar chart of the median gap to the best plan, in board feet per square foot, after 100, 500 and 2000 evaluations: " + "; ".join(
        f"{b}: random {d['random']:.3f}, local {d['local']:.3f}" for b, d in sorted(data.items()))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Median gap to the best plan, equal evaluation budgets</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">1000-1150 sq ft, 2+ bedrooms, 40 seeds; gap in board feet of framing per sq ft of floor</text>']
    for g in (0, 0.25, 0.5, 0.75, 1.0):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(g):.1f}" y2="{py(g):.1f}" stroke="#ddd"/>')
        o.append(f'<text x="{L-6}" y="{py(g)+4:.1f}" text-anchor="end" {f} font-size="11">{g:g}</text>')
    gw = (W - L - R) / len(data)
    bw = gw / 4
    for gi, (b, d) in enumerate(sorted(data.items())):
        x0 = L + gi * gw + gw / 2 - bw
        for k, name in enumerate(("random", "local")):
            v = d[name]
            x = x0 + k * bw
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{bw-2:.1f}" height="{H-B-py(v):.1f}" fill="{COLORS[name]}"/>')
            o.append(f'<text x="{x+bw/2-1:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" {f} font-size="11">{v:.3f}</text>')
        o.append(f'<text x="{L+gi*gw+gw/2:.1f}" y="{H-B+18}" text-anchor="middle" {f} font-size="12">{b} evaluations</text>')
    for k, name in enumerate(("random", "local")):
        o.append(f'<rect x="{L+k*140}" y="{H-18}" width="10" height="10" fill="{COLORS[name]}"/>')
        o.append(f'<text x="{L+k*140+14}" y="{H-9}" {f} font-size="11">{name} search</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" transform="rotate(-90 14 {(T+H-B)/2})" text-anchor="middle" {f} font-size="12">median gap (bf/sq ft)</text>')
    o.append("</svg>")
    (HERE / "search_gap.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "search_gap.svg")


if __name__ == "__main__":
    main()
