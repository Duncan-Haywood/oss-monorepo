"""Write experiments/ece.svg: expected calibration error vs rounds T (experiment E1).

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad", "#d68910", "#555555"]


def nums(line):
    return [float(x) for x in re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", line)]


def section(text, start, stop=None):
    """Lines of results.txt from the line starting with `start` up to the next blank line."""
    lines = text.splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip().startswith(start))
    out = []
    for l in lines[i + 1:]:
        if not l.strip():
            break
        out.append(l)
    return out


def svg(title, alt, xlabel, ylabel, xlabels, series, logy=False, ymin=None):
    """series = [(name, ys)]; categorical, evenly spaced x positions."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 56
    ys = [y for _, v in series for y in v]
    f = (lambda v: math.log10(v)) if logy else (lambda v: v)
    lo, hi = f(min(ys)), f(max(ys))
    pad = 0.08 * (hi - lo or 1)
    lo, hi = lo - pad, hi + pad
    if ymin is not None and not logy:
        lo = ymin
    n = len(xlabels)
    px = lambda i: L + i / max(n - 1, 1) * (W - L - R)
    py = lambda y: T + (hi - f(y)) / (hi - lo) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>']
    if logy:
        ticks = [m * 10 ** e for e in range(math.floor(lo) - 1, math.ceil(hi) + 1) for m in (1, 2, 5)]
        ticks = [t for t in ticks if lo <= math.log10(t) <= hi]
    else:
        step = 10 ** math.floor(math.log10((hi - lo) / 4))
        step *= min((1, 2, 5, 10), key=lambda m: abs((hi - lo) / (m * step) - 5))
        t0 = math.ceil(lo / step)
        ticks = [round(k * step, 10) for k in range(t0, int(hi / step) + 1)]
    for v in ticks:
        y = py(v)
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{y:.1f}" y2="{y:.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
    for i, s in enumerate(xlabels):
        o.append(f'<text x="{px(i):.1f}" y="{H-B+16}" text-anchor="middle" font-family="sans-serif" font-size="11">{s}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-14}" text-anchor="middle" font-family="sans-serif" font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for j, (name, v) in enumerate(series):
        c = COLS[j % len(COLS)]
        pts = " ".join(f"{px(i):.1f},{py(y):.1f}" for i, y in enumerate(v))
        o.append(f'<polyline fill="none" stroke="{c}" stroke-width="2" points="{pts}"/>')
        o += [f'<circle cx="{px(i):.1f}" cy="{py(y):.1f}" r="2.5" fill="{c}"/>' for i, y in enumerate(v)]
        ly = T + 18 + 16 * j
        o.append(f'<line x1="{L+12}" x2="{L+36}" y1="{ly}" y2="{ly}" stroke="{c}" stroke-width="2"/>'
                 f'<text x="{L+42}" y="{ly+4}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"



def main():
    rows = [nums(l) for l in section((HERE / "results.txt").read_text(), "E1")[1:]]
    rows = [r for r in rows if len(r) == 5]
    Ts = sorted({r[1] for r in rows})
    def col(K, j):
        return [next(r[j] for r in rows if r[0] == K and r[1] == T) for T in Ts]
    series = [("adaptive, K=10", col(10, 2)), ("adaptive, K=20", col(20, 2)), ("iid(0.7), K=10", col(10, 3)), ("worst-case bound, K=10", col(10, 4))]
    (HERE / "ece.svg").write_text(svg(
        "Calibration error of the information-free hedger (stylised)",
        "Expected calibration error versus number of rounds for adaptive and iid outcomes, with the worst-case bound",
        "rounds T", "expected calibration error (log scale)", [f"{T:g}" for T in Ts], series, logy=True))
    print("wrote", HERE / "ece.svg")


if __name__ == "__main__":
    main()
