"""Write experiments/repair_share.svg from experiments/results.txt (section A).

    python experiments/figure.py

Plots the working fleet against the repair cost share c (discrete-event median with its 5th-95th
percentile band, and the closed-form vitamin balance). Numbers are parsed from the committed run
output, never retyped: re-run run.py first if the experiment changes. Standard library only.
Stylised model; see the README for its limits.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def parse(text):
    """(c, des, lo, hi, formula) rows of section A, plus the replace-only (des, formula)."""
    block = text.split("== A.", 1)[1].split("== B.", 1)[0]
    rows, base = [], None
    for line in block.splitlines():
        m = re.match(r"replace only\s+DES\s+([\d.]+) \[\s*([\d.]+)-\s*([\d.]+)\].*formula\s+([\d.]+)", line)
        if m:
            base = tuple(map(float, m.groups()))
        m = re.match(r"repair c=([\d.]+)\s+DES\s+([\d.]+) \[\s*([\d.]+)-\s*([\d.]+)\].*formula\s+([\d.]+)", line)
        if m:
            rows.append(tuple(map(float, m.groups())))
    return rows, base


def svg(rows, base):
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 52
    x0, x1, y1 = 0.0, 1.0, 180.0

    def px(c):
        return L + (c - x0) / (x1 - x0) * (W - L - R)

    def py(v):
        return T + (y1 - v) / y1 * (H - T - B)

    f = 'font-family="sans-serif"'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Working fleet size against repair cost share: repair roughly triples the fleet at a low cost share and falls back to the replace-only level near a cost share of 0.8, in both the simulation and the closed form">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Working fleet vs repair cost share (stylised model)</text>']
    for t in range(0, 181, 30):
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(t):.1f}" y2="{py(t):.1f}" stroke="#ddd"/>'
                   f'<text x="{L-6}" y="{py(t)+4:.1f}" text-anchor="end" {f} font-size="11">{t}</text>')
    for c in (0.1, 0.3, 0.5, 0.7, 0.9):
        out.append(f'<text x="{px(c):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{c:g}</text>')
    out.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">repair cost share c (fraction of a new machine\'s vitamins)</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">working machines (time average)</text>')
    band = [f"{px(r[0]):.1f},{py(r[3]):.1f}" for r in rows] + [f"{px(r[0]):.1f},{py(r[2]):.1f}" for r in reversed(rows)]
    out.append(f'<polygon points="{" ".join(band)}" fill="#1f6fb2" fill-opacity="0.15"/>')
    out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(base[0]):.1f}" y2="{py(base[0]):.1f}" stroke="#888" stroke-dasharray="4 3"/>'
               f'<text x="{W-R-4}" y="{py(base[0])-4:.1f}" text-anchor="end" {f} font-size="11" fill="#555">replace only: {base[0]:g}</text>')
    for name, col, idx, dash in [("discrete-event median (band: 5th-95th pct)", "#1f6fb2", 1, ""), ("closed-form vitamin balance", "#c0392b", 4, ' stroke-dasharray="6 3"')]:
        pts = " ".join(f"{px(r[0]):.1f},{py(r[idx]):.1f}" for r in rows)
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2"{dash} points="{pts}"/>')
        for r in rows:
            out.append(f'<circle cx="{px(r[0]):.1f}" cy="{py(r[idx]):.1f}" r="3" fill="{col}"/>')
    for k, (name, col) in enumerate([("discrete-event median (band: 5th-95th pct)", "#1f6fb2"), ("closed-form vitamin balance", "#c0392b")]):
        ly = T + 34 + 16 * k
        out.append(f'<line x1="{W-300}" x2="{W-276}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                   f'<text x="{W-270}" y="{ly+4}" {f} font-size="11">{name}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    rows, base = parse((HERE / "results.txt").read_text())
    assert len(rows) >= 5 and base, "section A not found in results.txt"
    (HERE / "repair_share.svg").write_text(svg(rows, base))
    print("wrote repair_share.svg from %d rows" % len(rows))


if __name__ == "__main__":
    main()
