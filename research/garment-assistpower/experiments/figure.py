"""Write experiments/battery.svg: net whole-body change of the gain-0.3 active suit against battery hours, by mass sensitivity (best gain).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad", "#d68910"]


def main():
    series = []
    for l in TEXT:
        m = re.match(r"sens ([\d.]+): (.*)", l)
        if m:
            pts = re.findall(r"(\d+)h: gain [\d.]+ -> ([+-][\d.]+)%", m.group(2))
            series.append((f"sens {m.group(1)}/kg", [int(h) for h, _ in pts], [float(v) for _, v in pts]))
    if len(series) != 4 or any(len(s[1]) != 3 for s in series):
        raise SystemExit("expected 4 series of 3 points, parsed %r" % [len(s[1]) for s in series])
    lines("Best-gain net whole-body change vs battery hours",
          "Line plot of net whole-body metabolic change in percent at the best assistance gain against battery hours for four mass sensitivities",
          "battery hours (1, 4, 8)", "net whole-body change (%, negative = saving)", series, "battery.svg")


def lines(title, alt, xlabel, ylabel, series, fname, logx=False, logy=False, hline=None):
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
    (HERE / fname).write_text("\n".join(o) + "\n")
    print("wrote", HERE / fname)


if __name__ == "__main__":
    main()
