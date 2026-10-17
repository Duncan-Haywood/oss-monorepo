"""Write experiments/doubling_vs_budget.svg from experiments/results.txt (section A).

    python experiments/figure.py

The numbers are parsed from the committed run output, never retyped: re-run run.py first if the
experiment changes. Standard library only. Stylised model; see the README for its limits.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def parse(text):
    """Rows (budget per hour, DES median, fluid, free) from section A, finite budgets only."""
    block = text.split("== A.", 1)[1].split("== B.", 1)[0]
    rows = []
    for line in block.splitlines():
        m = re.match(r"budget\s+([\d.]+)/h\s+N\*=\s*[\d.]+\s+DES\s+([\d.]+)\s+\[[^\]]*\]\s+fluid\s+([\d.]+)\s+free\s+([\d.]+)", line)
        if m:
            rows.append(tuple(map(float, m.groups())))
    return rows


def svg(rows):
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 52
    xs = [math.log10(r[0]) for r in rows]
    x0, x1 = min(xs), max(xs)
    y0, y1 = math.log10(10), math.log10(10000)

    def px(b):
        return L + (math.log10(b) - x0) / (x1 - x0) * (W - L - R)

    def py(v):
        return T + (y1 - math.log10(v)) / (y1 - y0) * (H - T - B)

    f = 'font-family="sans-serif"'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Effective doubling time in hours against vitamin import budget on log axes: the discrete-event and fluid curves fall with budget and flatten toward the import-free floor of about 35 hours">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Doubling time vs vitamin import budget (stylised model)</text>']
    for t in (10, 100, 1000, 10000):
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(t):.1f}" y2="{py(t):.1f}" stroke="#ddd"/>'
                   f'<text x="{L-6}" y="{py(t)+4:.1f}" text-anchor="end" {f} font-size="11">{t:g}</text>')
    for r in rows:
        out.append(f'<text x="{px(r[0]):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{r[0]:g}</text>')
    free = rows[0][3]
    out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(free):.1f}" y2="{py(free):.1f}" stroke="#888" stroke-dasharray="4 3"/>'
               f'<text x="{W-R-4}" y="{py(free)-4:.1f}" text-anchor="end" {f} font-size="11" fill="#555">no import limit: {free:g} h</text>')
    out.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">vitamin import budget (units per hour)</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">effective doubling time (hours)</text>')
    for k, (name, col, idx) in enumerate([("discrete-event median", "#1f6fb2", 1), ("fluid (closed form)", "#c0392b", 2)]):
        pts = " ".join(f"{px(r[0]):.1f},{py(r[idx]):.1f}" for r in rows)
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{pts}"/>')
        for r in rows:
            out.append(f'<circle cx="{px(r[0]):.1f}" cy="{py(r[idx]):.1f}" r="3" fill="{col}"/>')
        ly = T + 34 + 16 * k
        out.append(f'<line x1="{W-250}" x2="{W-226}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                   f'<text x="{W-220}" y="{ly+4}" {f} font-size="11">{name}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    rows = parse((HERE / "results.txt").read_text())
    (HERE / "doubling_vs_budget.svg").write_text(svg(rows))
    print("wrote doubling_vs_budget.svg from %d rows" % len(rows))


if __name__ == "__main__":
    main()
