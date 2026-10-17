"""Shared helpers for experiments/figure.py: parse a results.txt block and draw a line plot as SVG.

A project's figure.py is then a few lines (see research/workcell-twin/experiments/figure.py):

    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_shared"))
    from linefig import table, write_lines

Numbers come from the committed results.txt, never retyped. Stdlib only.
"""
import math
import re
from pathlib import Path

COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad"]


def num(tok):
    try:
        return float(tok)
    except ValueError:
        return None


def table(text, section, xcol, ycols, maxrows=None):
    """Numeric rows of the results.txt block that starts with `section`; skips rows whose x is not a number."""
    xs, ys, on = [], [[] for _ in ycols], False
    for l in text:
        if l.startswith(section):
            on = True
            continue
        if on and (l.startswith("==") or (re.match(r"(\d\. |E\d)", l) and not l.startswith(section))):
            break
        p = l.split()
        if on and len(p) > max([xcol] + ycols) and num(p[xcol]) is not None and all(num(p[c]) is not None for c in ycols):
            xs.append(float(p[xcol]))
            for k, c in enumerate(ycols):
                ys[k].append(float(p[c]))
            if maxrows and len(xs) == maxrows:
                break
    if not xs:
        raise SystemExit("no rows parsed for section " + section)
    return xs, ys


def svg_lines(title, alt, xlabel, ylabel, series, logx=False, logy=False, hline=None):
    W, H, L, R, T, B = 640, 380, 64, 16, 56, 56
    fx = math.log10 if logx else (lambda v: v)
    fy = math.log10 if logy else (lambda v: v)
    xs_all = [fx(x) for _, xs, _ in series for x in xs]
    ys_all = [fy(y) for _, _, ys in series for y in ys if (y > 0 or not logy)] + ([fy(hline)] if hline else [])
    x0, x1 = min(xs_all), max(xs_all)
    y0, y1 = min(ys_all), max(ys_all)
    if not logy:
        y0 = min(y0, 0)
    pad = (y1 - y0) * 0.06 or 1
    y1 += pad
    if logy:
        y0 -= pad
    px = lambda x: L + (fx(x) - x0) / ((x1 - x0) or 1) * (W - L - R)
    py = lambda y: T + (1 - (fy(y) - y0) / (y1 - y0)) * (H - T - B)
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">{title}</text>']
    if logy:
        ticks = [10 ** k for k in range(math.ceil(y0), math.floor(y1) + 1)]
    else:
        step = 10 ** math.floor(math.log10((y1 - y0) / 4))
        step *= min((1, 2, 5, 10), key=lambda m: abs((y1 - y0) / (m * step) - 5))
        ticks = [k * step for k in range(math.ceil(y0 / step), math.floor(y1 / step) + 1)]
    for v in ticks:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {f} font-size="11">{v:g}</text>')
    xt = sorted({x for _, xs, _ in series for x in xs})
    if logx:
        dec = [10 ** k for k in range(math.ceil(x0), math.floor(x1) + 1)]
        xt = dec if len(dec) >= 3 else xt
    if len(xt) > 8:
        xt = xt[:: math.ceil(len(xt) / 8)]
    for v in xt:
        o.append(f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{v:g}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    if hline:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(hline):.1f}" y2="{py(hline):.1f}" stroke="#555" stroke-dasharray="4 3"/>')
    for j, (n, xs, ys) in enumerate(series):
        c = COLS[j % len(COLS)]
        pts = [(px(x), py(y)) for x, y in zip(xs, ys) if y > 0 or not logy]
        o.append('<polyline points="' + " ".join(f"{a:.1f},{b:.1f}" for a, b in pts) + f'" fill="none" stroke="{c}" stroke-width="2"/>')
        o += [f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3" fill="{c}"/>' for a, b in pts]
        lx = L + 170 * j
        o.append(f'<rect x="{lx}" y="32" width="14" height="10" fill="{c}"/><text x="{lx+20}" y="41" {f} font-size="11">{n}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def write_lines(here, fname, *args, **kw):
    """Draw svg_lines(...) to here/fname and print the path, as the per-project copies did."""
    path = Path(here) / fname
    path.write_text(svg_lines(*args, **kw))
    print("wrote", path)
