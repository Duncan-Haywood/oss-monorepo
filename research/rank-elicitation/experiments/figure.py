"""Write experiments/ratio.svg: adjacent-swap regret of linear-rank vs Brier-derived ranking payments as the gap shrinks (section E1).

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#c0392b", "#2e8b57", "#8e44ad", "#e08e0b"]


def lines_svg(title, alt, series, xlabel, ylabel, xlog=False, ylog=False):
    """series = [(name, [(x, y), ...])]; polylines with markers, a box, ticks and a legend."""
    import math
    W, H, L, R, T, B = 720, 400, 64, 16, 40, 70
    f = lambda v, lg: math.log10(v) if lg else v
    xs = [f(x, xlog) for _, p in series for x, _ in p]; ys = [f(y, ylog) for _, p in series for _, y in p]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    py_ = (y1 - y0) * 0.08 or 1; y0 -= py_; y1 += py_
    px = lambda v: L + (f(v, xlog) - x0) / (x1 - x0) * (W - L - R)
    py = lambda v: T + (1 - (f(v, ylog) - y0) / (y1 - y0)) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>',
         f'<rect x="{L}" y="{T}" width="{W-L-R}" height="{H-T-B}" fill="none" stroke="#999"/>']
    for i in range(6):
        v = y0 + (y1 - y0) * i / 5; lab = f"{10**v:.3g}" if ylog else f"{v:.2f}"
        yy = T + (1 - i / 5) * (H - T - B)
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="#eee"/><text x="{L-6}" y="{yy+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{lab}</text>')
    for i in range(6):
        v = x0 + (x1 - x0) * i / 5; lab = f"{10**v:.3g}" if xlog else f"{v:.2f}"
        xx = L + i / 5 * (W - L - R)
        o.append(f'<text x="{xx:.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{lab}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-B+34}" text-anchor="middle" font-family="sans-serif" font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for s, (n, p) in enumerate(series):
        c = COLS[s % len(COLS)]
        o.append(f'<polyline fill="none" stroke="{c}" stroke-width="2" points="{" ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in p)}"/>')
        o += [f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="3" fill="{c}"/>' for x, y in p]
        lx = L + s * 200
        o.append(f'<rect x="{lx}" y="{H-24}" width="12" height="10" fill="{c}"/><text x="{lx+16}" y="{H-15}" font-family="sans-serif" font-size="11">{n}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"

def main():
    pts, on = [], False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("E1"):
            on = True
        elif l.startswith("E2"):
            break
        elif on:
            m = re.match(r"\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$", l)
            if m:
                pts.append((float(m.group(1)), float(m.group(4))))
    assert len(pts) == 5, pts
    (HERE / "ratio.svg").write_text(lines_svg(
        "Linear-rank regret relative to Brier-derived ranking, by gap",
        "Log-log line plot of the ratio of linear-rank to Brier-derived adjacent-swap regret against the probability gap",
        [("linear / Brier", pts)], "gap between adjacent true probabilities", "regret ratio (linear / Brier)", xlog=True, ylog=True))
    print("wrote", HERE / "ratio.svg")


if __name__ == "__main__":
    main()
