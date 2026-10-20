"""Write experiments/optimal_arity.svg: the continuous-optimum arity k* against the cost ratio a/b, parsed from section 1 of results.txt (log-log).

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
NUM = r"[-+]?[\d.]+(?:e[-+]?\d+)?"


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
    rows, on = [], False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== 1."):
            on = True
        elif on and l.startswith("=="):
            break
        elif on:
            m = re.match(r"a/b=\s*("+NUM+r")\s+k\*=\s*("+NUM+r")\s*$", l)
            if m:
                rows.append([float(g) for g in m.groups()])
    assert len(rows) == 8, rows
    (HERE / "optimal_arity.svg").write_text(lines_svg(
        "Cost-minimising dispute arity k* against a/b",
        "Continuous optimal arity of a dispute game against the ratio of per-round cost a to per-branch cost b, on log axes",
        "a/b (log10)", "optimal arity k* (log10)", [("k*", [tuple(r) for r in rows])], xlog=True, ylog=True))
    print("wrote", HERE / "optimal_arity.svg")


if __name__ == "__main__":
    main()
