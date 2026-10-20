"""Write experiments/gap.svg: real expected energy over the twin claim against the real wind half-width, parsed from section 3 of results.txt (rows with a finite ratio).

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent


def section(n):
    """Lines of results.txt between '== n.' and the next '== ' header."""
    out, on = [], False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith(f"== {n}."):
            on = True
        elif on and l.startswith("== "):
            break
        elif on:
            out.append(l)
    return out


def lines_svg(title, alt, xlabel, ylabel, series, xlog=False, ylog=False):
    """series = [(name, [(x, y)])]; a line plot with markers."""
    import math
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    COLS = ["#1f6fb2", "#c0392b", "#2e8b57", "#8e44ad"]
    pts = [p for _, s in series for p in s]
    f = lambda v, lg: math.log10(v) if lg else v
    xs = [f(p[0], xlog) for p in pts]; ys = [f(p[1], ylog) for p in pts]
    x0, x1 = min(xs), max(xs); y0, y1 = min(ys), max(ys)
    pad = (y1 - y0) * 0.08 or 1; y0 -= pad; y1 += pad
    px = lambda x: L + (f(x, xlog) - x0) / ((x1 - x0) or 1) * (W - L - R)
    py = lambda y: T + (1 - (f(y, ylog) - y0) / (y1 - y0)) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>',
         f'<rect x="{L}" y="{T}" width="{W-L-R}" height="{H-T-B}" fill="none" stroke="#999"/>']
    for i in range(6):
        v = y0 + (y1 - y0) * i / 5; yy = T + (1 - i / 5) * (H - T - B)
        lab = f"1e{v:.1f}" if ylog else f"{v:.3g}"
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="#eee"/><text x="{L-6}" y="{yy+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{lab}</text>')
    for x in sorted({p[0] for p in pts}):
        o.append(f'<text x="{px(x):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{x:g}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-8}" text-anchor="middle" font-family="sans-serif" font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for j, (name, s) in enumerate(series):
        c = COLS[j % 4]
        o.append(f'<polyline fill="none" stroke="{c}" stroke-width="2" points="{" ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in s)}"/>')
        o += [f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="3" fill="{c}"/>' for x, y in s]
        ly = T + 16 + 15 * j
        o.append(f'<rect x="{W-R-190}" y="{ly-8}" width="12" height="10" fill="{c}"/><text x="{W-R-172}" y="{ly+1}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    rows = []
    for l in section(3):
        m = re.match(r"\s*([\d.]+)\s+[\d.]+\s+[\d.]+\s+([\d.]+)\s", l)
        if m:
            rows.append((float(m.group(1)), float(m.group(2))))
    assert len(rows) >= 8, rows
    return lines_svg("Real energy / twin claim vs wind half-width a", "Ratio of real expected energy to the twin's claim against real wind half-width, finite rows only",
                     "real wind half-width a (mean 0.3)", "real / claim", [("real / claim", rows)])


if __name__ == "__main__":
    (HERE / "gap.svg").write_text(main())
    print("wrote", HERE / "gap.svg")
